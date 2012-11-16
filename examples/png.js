var Canvas = require('Canvas')
  , fs = require('fs')
  , fav = require('./../fav')(Canvas)
  , icon = fav('favicon.ico').getLargest()

icon.createPNGStream().pipe(fs.createWriteStream('example.png'))