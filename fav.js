
function FaviconDir(Canvas, buf){
  this.Canvas = Canvas
  if(typeof buf === 'string') buf = require('fs').readFileSync(buf)
  var p = 0 // buffer file position
  if(buf.readUInt16LE(p++)!==0) 
    // the reserved section should be 0x0000
    throw formatError()
  p++
  
  this.type = buf.readUInt16LE(p++); p++
  
  if(this.type!==1) throw new Error("Only ICO format is supported. (not CUR)")
  this.count = buf.readUInt16LE(p++)
  p++
  
  // read the directory entries
  this.entries = this.readEntries(p,buf)
}

FaviconDir.prototype.readEntries = function(p,buf){
  var entry, entries = []
  for(var i = 0; i < this.count; i++){
    entry = {}
    entry.width = buf.readUInt8(p++)
    if(entry.width === 0) entry.width = 256
    entry.height = buf.readUInt8(p++)
    if(entry.height === 0) entry.height = 256
    entry.colorCount = buf.readUInt8(p++)
    // if colorCount is 0, means no color palette
    // reserved block should be 0
    if(buf.readUInt8(p++) !== 0) throw formatError()
    entry.planes = buf.readUInt16LE(p++); p++
    entry.bitCount = buf.readUInt16LE(p++); p++
    entry.bytesInRes = buf.readUInt32LE(p++); p+=3
    entry.imageOffset = buf.readUInt32LE(p++); p+=3
    // go read the image
    entry.image = this.readImage(buf,entry)
    entries.push(entry)
  }
  return entries
}

FaviconDir.prototype.readImage = function(buf,entry){
  // where `p` is the current buffer offset position
  var image = {}
    , header = {} 
    , p = entry.imageOffset
    , colorTablePos
    , ind
    , color
    , canvas
    , ctx
    , img
  
  if( buf.toString('hex', p, p + 8) === '89504e470d0a1a0a' ){
    img = new this.Canvas.Image()
    img.src = buf.slice(p)
    canvas = new this.Canvas(img.width, img.height)
    ctx = canvas.getContext('2d')
    ctx.drawImage(img,0,0, img.width, img.height)
    return canvas
    // see: http://en.wikipedia.org/wiki/Portable_Network_Graphics
  }
  
  // ref: http://upload.wikimedia.org/wikipedia/commons/c/c4/BMPfileFormat.png
  // DIB Header ??
  header.size = buf.readUInt32LE(p++); p+=3 // the size of the DIB header section (include this field)
  if(header.size===40) p = this.readBitmapInfoHeader(p,buf,header)
  else throw new Error("Unsupported bitmap header type. Only BITMAPINFOHEADER "
    + "type is supported at this time. (header.size===" + header.size + ")")
  if(header.compression !== 0) throw new Error("Unsupported compression "
    + "method. The only currently supported compression method is None.")
  
  header.pixels = header.width * header.height
  image.data = []
  image.header = header
  if(header.bitCount === 32 || header.bitCount === 24){
    var b, g, r, a
    var bytesPerPixel = header.bitCount === 32 ? 4 : 3
    p = p + bytesPerPixel * header.pixels + header.width * bytesPerPixel
    // read the file in from bottom to top. if we don't do this, the image
    // will be flipped
    for(var i = header.height - 1; i >= 0; i--){
      p -= header.width * 2 * bytesPerPixel
      for(var j = 0; j < header.width; j++){
        b = buf.readUInt8(p++)
        g = buf.readUInt8(p++)
        r = buf.readUInt8(p++)
        a = (header.bitCount === 32 ) ? buf.readUInt8(p++) : 255 /*opace*/
        image.data.push(r)
        image.data.push(g)
        image.data.push(b)
        image.data.push(a)
      }
    }
    return this.imageToCanvas(header.width, header.height, image)
  }
  
  function readColor(ind){
    return {
      b : buf.readUInt8(colorTablePos + ind * 4 )
      , g : buf.readUInt8(colorTablePos + ind * 4 + 1)
      , r : buf.readUInt8(colorTablePos + ind * 4 + 2)
      , a : buf.readUInt8(colorTablePos + ind * 4 + 3)
      // , a : 255
    }
  }
  
  if(header.bitCount === 8){
    // "The 8-bit per pixel (8bpp) format supports 256 distinct colors and 
    // stores 1 pixel per 1 byte. Each byte is an index into a table of up to 
    // 256 colors." -- wikipedia
    if(header.clrUsed === 0) header.clrUsed = 256
    // 8bit image using a color table
    colorTablePos = entry.imageOffset + header.size
    // at this point, p === colorTablePos
    
    // were the actual image starts
    p = p + header.clrUsed * 4 /* 4 bytes per pixel in the color pallete */
    // read the image in from bottom to top
    p += header.pixels + header.width
    var all_alpha = true
    for(var i = header.height - 1; i >= 0; i--){
      p -= header.width * 2
      for(var j = 0; j < header.width; j++){
        ind = buf.readUInt8(p++)
        color = readColor(ind)
        image.data.push(color.r)
        image.data.push(color.g)
        image.data.push(color.b)
        image.data.push(color.a)
        all_alpha = all_alpha && color.a === 0
      }
    }
    if(all_alpha){
      // all the pixel alpha values where 0x00 which would make the ico file 
      // invisible
      for(var i = 0; i < image.data.length;i+=4){
        image.data[i+3] = 255
      }
    }
  }else if(header.bitCount === 4){
    // "The 4-bit per pixel (4bpp) format supports 16 distinct colors and stores
    //  2 pixels per 1 byte, the left-most pixel being in the more significant 
    // nibble.[1] Each pixel value is a 4-bit index into a table of up to 16 
    // colors." -- wikipedia
    
    if(header.clrUsed === 0 ) header.clrUsed = 16
    // 4bit image using color table
    colorTablePos = entry.imageOffset + header.size
    // at this point, p === colorTablePos
    
    // go to where the actual image starts
    p = p + header.clrUsed * 4 /* 4 bytes per pixel in the color pallete */
    // read the image in from bottom to top
    p += header.pixels / 2 + header.width / 2
    for(var i = header.height - 1; i >= 0; i--){
      p -= header.width
      for(var j = 0; j < header.width; j++){
        if(j % 2 === 0) // if j is even
          ind = ( buf.readUInt8(p) & 0xf0 ) >> 4
        else
          ind = ( buf.readUInt8(p++) & 0x0f )
        color = readColor(ind)
        image.data.push(color.r)
        image.data.push(color.g)
        image.data.push(color.b)
        image.data.push(0xff)
      }
    }
  }else{
    // TODO: support the other, less common, bit formats
    throw new Error("Unsupported bitmap format of " + header.bitCount + "bit. Only 8bit, 24bit, and 32bit"
    + " bitmap formatted images are supported at this time")
  }
  return this.imageToCanvas(header.width, header.height, image)
}

FaviconDir.prototype.imageToCanvas = function(width, height, image){
  var canvas = new this.Canvas(width,height)
    , ctx = canvas.getContext('2d')
    , imageData = ctx.getImageData(0, 0, width, height)
    ctx.antialias = 'none'
    for(var i = 0; i < image.data.length; i++)
      imageData.data[i] = image.data[i]
    ctx.putImageData(imageData, 0, 0)
    return canvas
}

//  DIB Header is the BITMAPINFOHEADER
// see: http://en.wikipedia.org/wiki/BMP_file_format
FaviconDir.prototype.readBitmapInfoHeader = function(p,buf,header){
  header.width = buf.readInt32LE(p++); p+=3
  header.height = Math.abs( buf.readInt32LE(p++) / 2 ); p+=3
  header.planes = buf.readUInt16LE(p++); p++
  header.bitCount = buf.readUInt16LE(p++); p++
  header.compression = buf.readUInt32LE(p++); p+=3
  header.imageSize = buf.readUInt32LE(p++); p+=3
  header.xPelsPerMeter = buf.readUInt32LE(p++); p+=3
  header.yPelsPerMeter = buf.readUInt32LE(p++); p+=3
  // colors in color table
  header.clrUsed = buf.readUInt32LE(p++); p+=3
  // important color count
  header.clrImportant = buf.readUInt32LE(p++); p+=3
  return p
}

// the print functions are mainly for debugging

FaviconDir.prototype.printDirectory = function(){
  console.log('-----directory-----')
  console.log('type: ' + this.type)
  console.log('count: ' + this.count)
}

FaviconDir.prototype.printEntries = function(){
  console.log('-----entries-----')
  for(var i = 0; i < this.entries.length;i++){
    var entry = this.entries[i]
    console.log('entry')
    console.log(entry)
  }
}

FaviconDir.prototype.printColorTable = function(buf,colorTablePos,clrUsed){
  // print the color table
  console.log('-----color table-----')
  for(var i = 0; i < clrUsed; i++){
    console.log('color: 0x'
      + buf.toString('hex', colorTablePos + i*4, colorTablePos + i*4 + 1)
      + buf.toString('hex', colorTablePos + i*4 + 1, colorTablePos + i*4 + 2)
      + buf.toString('hex', colorTablePos + i*4 + 2, colorTablePos + i*4 + 3)
      + buf.toString('hex', colorTablePos + i*4 + 3, colorTablePos + i*4 + 4)
    )
  }
}

function getLargest(){
  if(!this.images.length) return null
  var largest = this.images[0], image
  for(var i = 1; i < this.images.length; i++){
    image = this.images[i]
    if(image.width * image.height > largest.width * largest.height) 
      largest = image
  }
  return largest
}


module.exports = function(Canvas){
  return function(buf){
    var dir = new FaviconDir(Canvas,buf)
    var images = [], image, entry
    for(var i = 0; i < dir.entries.length; i++){
      image = dir.entries[i].image
      images.push(image)
    }
    
    var ret = {}
    ret.images = images
    ret.getLargest = getLargest
    return ret
  }
}


function formatError(){
  return new Error("The ICO file is not property formated")
}