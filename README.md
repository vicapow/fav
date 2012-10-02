# Fav
## A simple module for parsing a favicon ICO files.

to install
    
    npm install fav

Here's a simple usage example

    var fav = require('../index.js')

    fav.('favicon.ico',function(err,ico){
      if(err) throw err
      console.log('there are : '+ico.images.length+' icons in this ICO file')
    })