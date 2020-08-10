const libxml = require('libxmljs');
const bent = require('bent');
const vCard = require("vcf");
const he = require('he');
const express = require('express');
const basicAuth = require('express-basic-auth')
const settings = require('./settings.json');

function firstUpper(str) {
    str = str.split(' ')
    return str.reduce((acc, n) => acc + " " + n.charAt(0).toUpperCase()
    + n.slice(1).toLowerCase(), "").trim()
}

const CardGW = new class {
    constructor() {
        this.baseurl = `https://${settings.user}:${settings.password}@${settings.url}`;
        this.xmlns = {
            dav: 'DAV:',
            card: 'urn:ietf:params:xml:ns:carddav'
        };
    }

    async getAddressbooks(entrypoints) {
        const collections_unchecked = entrypoints, collections_checked = [], addressbooks = [];
        const request_body = new libxml.Document();
        request_body.node('propfind').namespace(this.xmlns['dav'])
            .node('prop').namespace(this.xmlns['dav'])
                .node('resourcetype').namespace(this.xmlns['dav']);
        const ep_propfind = bent(this.baseurl, "PROPFIND", "string", 207, { "Depth": "1" });

        while (collections_unchecked.length) {
            const collection = collections_unchecked.pop();
            collections_checked.push(collection);
            try {
                var response = libxml.parseXml(await ep_propfind(collection, request_body.toString()));
            } catch (err) {
                console.log(err);
                continue;
            }
            let results = response.find('/dav:multistatus/dav:response/dav:href/text()[../../dav:propstat/dav:prop/dav:resourcetype/dav:collection]', this.xmlns);
            for(const collection of results) {
                const url = collection.toString();
                if (!collections_checked.includes(url) && !collections_unchecked.includes(url)) {
                    collections_unchecked.push(url);
                }
            }

            results = response.find('/dav:multistatus/dav:response/dav:href/text()[../../dav:propstat/dav:prop/dav:resourcetype/card:addressbook]', this.xmlns);
            for(const addressbook of results) {
                const url = addressbook.toString();
                if (!addressbooks.includes(url)) {
                    addressbooks.push(url);
                }
            }
        }
        return addressbooks;
    }

    async getContacts(addressbooks) {
        const contacts = {};
        const request_body = new libxml.Document();
        request_body.node('addressbook-query').namespace(this.xmlns['card'])
            .node('prop').namespace(this.xmlns['dav'])
                .node('address-data').namespace(this.xmlns['card'])
                    .node('prop').namespace(this.xmlns['card']).attr('name', 'TEL')
                .parent()
                    .node('prop').namespace(this.xmlns['card']).attr('name', 'N');
        const ep_report = bent(this.baseurl, "REPORT", "string", 207, { "Depth": "1" });
        for(const addressbook of addressbooks) {
            try {
                var response = new libxml.parseXml(await ep_report(addressbook, request_body.toString()));
            } catch (err) {
                console.log(err)
                continue
            }
            const group = addressbook.split('/')[3];
            if(!(group in contacts)) {
                contacts[group] = [];
            }
            let results = response.find('/dav:multistatus/dav:response/dav:propstat/dav:prop/card:address-data/text()', this.xmlns);
            for(const contact of results) {
                const vcard = new vCard().parse(he.decode(contact.toString()));
                contacts[group].push(vcard);
            }
        }
        return contacts;
    }

    createPhonebook(contacts) {
        const xml_addressbook = new libxml.Document();
        xml_addressbook.node('AddressBook')
            .node('version', 1)
        let group_idx = 0, contact_idx = 0;
        for(const group in contacts) {
            xml_addressbook.get('/AddressBook')
                .node('pbgroup')
                    .node('id', String(++group_idx))
                    .parent()
                    .node('name', firstUpper(decodeURIComponent(group).replace(/\.|\;|\,/gm, ' ')));

            for(const contact of contacts[group]) {
                let tels = contact.get("tel");
                if (tels) {
                    const name = contact.get("n").toJSON()[3];
                    const contact_ref = xml_addressbook.get('/AddressBook')
                    .node('Contact')
                        .node('id', String(++contact_idx))
                        .parent()
                        .node('FirstName', name[1])
                        .parent()
                        .node('LastName', name[0])
                        .parent()
                        .node('Group', String(group_idx))
                        .parent();
                    if (!Array.isArray(tels)) {
                        tels = [tels]
                    }
                    try {
                        tels.forEach(tel => {
                            let tel_type = tel["type"];
                            if (!Array.isArray(tel_type)) {
                                tel_type = [tel_type];
                            }
                            
                            contact_ref
                                .node('Phone').attr('type', firstUpper(tel_type.join(' ')))
                                    .node('phonenumber', String(tel.valueOf()).replace(/^\+(.*)$/gm, '00$1') )
                                    .parent()
                                    .node('accountindex', String(0));
                        });

                    } catch { }
                }
            }
        }
        return xml_addressbook;
    }

}

var app = express();

app.use(basicAuth({
    authorizer: (user, pass) => user in settings.users && pass == settings.users[user].pass,
    challenge: true,
}));

app.get('/phonebook.xml', async function (req, res) {
    console.log(`${req.auth.user} requested phonebook`);
    const addressbooks = await CardGW.getAddressbooks(settings.users[req.auth.user].addressbooks.map(path => settings.base + path + '/'));
    const contacts = await CardGW.getContacts(addressbooks);
    res.set('Content-Type', 'application/xml');
    res.send(CardGW.createPhonebook(contacts).toString());
});

app.listen(80, function () {
    console.log(`CardGW listening on HTTP Port 80!`);
});
