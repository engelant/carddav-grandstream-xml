#!/bin/bash

if [ ! -f "./settings.json" ]; then
    cat settings.json.default > settings.json
fi

node index.js
