This is supposed to connect to a cardDAV Server via a single user, and provide a HTTP requestable Server for Grandstream phones to get a phonebook.xml which is generated on the fly.

This is only tested against kopano for now.

User management is in cleartext in the settings json, as well as the base address book urls for the associated users (for shared/public address books).

The scraping with PROPFIND is terribly slow, especially as the collections/addressbooks are mixed and the request returns all nested entries (including contacts).

Someday I might write a better doc, so sorry for now.