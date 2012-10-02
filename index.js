var fs = require('fs')
  , jParser = require('jparser')
  , _ = require('underscore')
  , Canvas = require('canvas')
  , util = require('util')

module.exports = function(filename,cb){
  // the spec: http://msdn.microsoft.com/en-us/library/ms997538.aspx
  fs.readFile(filename, function (err, buffer) {
    if(err) return cb(err)
    try{
      var parser = new jParser(buffer,{
        header : {
          reserved: 'uint16'
          , type: 'uint16'
          , imageCount: 'uint16'
        }
      
        // an image entry in the directory of the ICO file
        , iconDirEntry : {
          bWidth : 'uint8'
          , bHeight : 'uint8'
          , bColorCount : 'uint8'
          , bReserved : 'uint8'
          , wPlanes : 'uint16'
          , wBitCount : 'uint16'
          , dwBytesInRes : 'uint32'
          , dwImageOffset : 'uint32'
        }
      
        , rgba: {
          b: 'uint8'
          , g: 'uint8'
          , r: 'uint8'
          , a: 'uint8'
        }
        // http://msdn.microsoft.com/en-us/library/windows/desktop/dd183376(v=vs.85).aspx
        , bitmapInfoHeader : {
          biSize : 'uint32'
          , width : 'uint32'
          , height : function(){
            return this.parse('uint32') / 2
          }
          // a lot of these fields arent used but they're still there in the 
          // binary
          , biPlanes : 'uint16'
          , biBitCount : 'uint16'
          , biCompression : 'uint32'
          , biSizeImage : 'uint32'
          , biXPelsPerMeter : 'uint32'
          , biYPelsPerMeter : 'uint32'
          , biClrUsed : 'uint32'
          , biClrImportant : 'uint32'
        }

        , images : function(){
          var self = this
            , res = []
          _.each(this.current.idEntries,function(entry){
            self.seek(entry.dwImageOffset)
            res.push(self.parse('iconImage'))
          })
          return res
        }
        , iconImage : {
          header : 'bitmapInfoHeader'
          , pixels : [ 'array' , 'rgba' , function(){ 
            // return this.current.icHeader.biSize 
            return this.current.header.width *  this.current.header.height
          }]
        }
        
        , file: {
          header: 'header'
          , idEntries : ['array','iconDirEntry', function(){ 
            return this.current.header.imageCount 
          }]
          , images: 'images'
        }
      })
    }catch(e){ if(e) return cb(e) }
    return cb(null,parser.parse('file'))
  })
}