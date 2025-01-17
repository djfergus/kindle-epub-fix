const TXT_PROCESSING = 'Processing...'
const TXT_DONE = 'Finished processing all files.'
const TXT_NO_ERROR = 'No errors detected. Perhaps there are other errors?<br>Output file is available for download anyway.'
const TXT_SYS_ERROR = 'The program encountered an internal error.'

const keepOriginalFilename = false

let filenames = [], fixedBlobs = [], dlfilenames = []

function basename(path) {
  return path.split('/').pop()
}

function simplify_language(lang) {
  return lang.split('-').shift().toLowerCase()
}

class EPUBBook {
  fixedProblems = []

  // Add UTF-8 encoding declaration if missing
  fixEncoding() {
    const encoding = '<?xml version="1.0" encoding="utf-8"?>'
    const regex = /^<\?xml\s+version=["'][\d.]+["']\s+encoding=["'][a-zA-Z\d-.]+["'].*?\?>/i

    for (const filename in this.files) {
      const ext = filename.split('.').pop()
      if (ext === 'html' || ext === 'xhtml') {
        let html = this.files[filename]
        html = html.trimStart()
        if (!regex.test(html)) {
          html = encoding + '\n' + html
          this.fixedProblems.push(`Fixed encoding for file ${filename}`)
        }
        this.files[filename] = html
      }
    }
  }

  // Fix linking to body ID showing up as unresolved hyperlink
  fixBodyIdLink() {
    const bodyIDList = []
    //const parser = new DOMParser('')
    //const parser = new JSDOM ()

    // Create list of ID tag of <body>
    for (const filename in this.files) {
      const ext = filename.split('.').pop()
      if (ext === 'html' || ext === 'xhtml') {
        let html = this.files[filename]
        //const dom = parser.parseFromString(html, 'text/html')
        const dom = new JSDOM (html,{contentType: "text/html"})
        const bodyID = dom.window.document.getElementsByTagName('body')[0].id
        if (bodyID.length > 0) {
          const linkTarget = basename(filename) + '#' + bodyID
          bodyIDList.push([linkTarget, basename(filename)])
        }
      }
    }

    // Replace all
    for (const filename in this.files) {
      for (const [src, target] of bodyIDList) {
        if (this.files[filename].includes(src)) {
          this.files[filename] = this.files[filename].replaceAll(src, target)
          this.fixedProblems.push(`Replaced link target ${src} with ${target} in file ${filename}.`)
        }
      }
    }
  }

  // Fix language field not defined or not available
  fixBookLanguage() {
    // From https://kdp.amazon.com/en_US/help/topic/G200673300
    // Retrieved: 2022-Sep-13
    const allowed_languages = [
      // ISO 639-1
      'af', 'gsw', 'ar', 'eu', 'nb', 'br', 'ca', 'zh', 'kw', 'co', 'da', 'nl', 'stq', 'en', 'fi', 'fr', 'fy', 'gl',
      'de', 'gu', 'hi', 'is', 'ga', 'it', 'ja', 'lb', 'mr', 'ml', 'gv', 'frr', 'nb', 'nn', 'pl', 'pt', 'oc', 'rm',
      'sco', 'gd', 'es', 'sv', 'ta', 'cy',

      // ISO 639-2
      'afr', 'ara', 'eus', 'baq', 'nob', 'bre', 'cat', 'zho', 'chi', 'cor', 'cos', 'dan', 'nld', 'dut', 'eng', 'fin',
      'fra', 'fre', 'fry', 'glg', 'deu', 'ger', 'guj', 'hin', 'isl', 'ice', 'gle', 'ita', 'jpn', 'ltz', 'mar', 'mal',
      'glv', 'nor', 'nno', 'por', 'oci', 'roh', 'gla', 'spa', 'swe', 'tam', 'cym', 'wel',
    ]

    // Find OPF file
    if (!('META-INF/container.xml' in this.files)) {
      console.error('Cannot find META-INF/container.xml')
      return
    }
    const meta_inf_str = this.files['META-INF/container.xml']
    const meta_inf = new JSDOM (meta_inf_str, {contentType: "text/xml"})
    let opf_filename = ''
    for (const rootfile of meta_inf.window.document.getElementsByTagName('rootfile')) {
      if (rootfile.getAttribute('media-type') === 'application/oebps-package+xml') {
        opf_filename = rootfile.getAttribute('full-path')
      }
    }

    // Read OPF file
    if (!(opf_filename in this.files)) {
      console.error('Cannot find OPF file!')
      return
    }

    const opf_str = this.files[opf_filename]
    try {
      const opf = new JSDOM (opf_str, {contentType: "text/xml"})
      const language_tags = opf.window.document.getElementsByTagName('dc:language')
      let language = 'en'
      let original_language = 'undefined'
      if (language_tags.length === 0) {
        language = prompt('E-book does not have language tag. Please specify the language of the book in RFC 5646 format, e.g. en, fr, ja.', 'en') || 'en'
      } else {
        language = language_tags[0].innerHTML
        original_language = language
      }
      if (!allowed_languages.includes(simplify_language(language))) {
        language = prompt(`Language ${language} is not supported by Kindle. Documents may fail to convert. Continue or specify new language of the book in RFC 5646 format, e.g. en, fr, ja.`, language) || language
      }
      if (language_tags.length === 0) {
        const language_tag = opf.createElement('dc:language')
        language_tag.innerHTML = language
        opf.getElementsByTagName('metadata')[0].appendChild(language_tag)
      } else {
        language_tags[0].innerHTML = language
      }
      if (language !== original_language) {
        this.files[opf_filename] = new XMLSerializer().serializeToString(opf)
        this.fixedProblems.push(`Change document language from ${original_language} to ${language}.`)
      }
    } catch (e) {
      console.error(e)
      console.error('Error trying to parse OPF file as XML.')
    }
  }

  fixStrayIMG() {
    for (const filename in this.files) {
      const ext = filename.split('.').pop()
      if (ext === 'html' || ext === 'xhtml') {
        let ctype = ext === 'xhtml' ? 'application/xhtml+xml' : 'text/html';
	let html = new JSDOM (this.files[filename], {contentType: ctype})
        let strayImg = []
        for (const img of html.window.document.getElementsByTagName('img')) {
          if (!img.getAttribute('src')) {
            strayImg.push(img)
          }
        }
        if (strayImg.length > 0) {
          for (const img of strayImg) {
            img.parentElement.removeChild(img)
          }
          this.fixedProblems.push(`Remove stray image tag(s) in ${filename}`)
          this.files[filename] = new XMLSerializer().serializeToString(html)
        }
      }
    }
  }

  async readEPUB(blob) {
    const reader = new zip.ZipReader(new zip.BlobReader(blob))
    this.entries = await reader.getEntries()
    this.files = {}
    this.binary_files = {}
    for (const entry of this.entries) {
      const filename = entry.filename
      const ext = filename.split('.').pop()
      if (filename === 'mimetype' || ['html', 'xhtml', 'htm', 'xml', 'svg', 'css', 'opf', 'ncx'].includes(ext)) {
        this.files[filename] = await entry.getData(new zip.TextWriter('utf-8'))
      } else {
        this.binary_files[filename] = await entry.getData(new zip.Uint8ArrayWriter())
      }
    }
  }

  async writeEPUB() {
    const blobWriter = new zip.BlobWriter('application/epub+zip')

    // EPUB Zip cannot have extra attributes, so no extended timestamp
    const writer = new zip.ZipWriter(blobWriter, { extendedTimestamp: false })

    // First write mimetype file
    if ('mimetype' in this.files) {
      await writer.add('mimetype', new zip.TextReader(this.files['mimetype']), { level: 0 })
    }

    // Add text file
    for (const file in this.files) {
      if (file === 'mimetype') {
        // We have already added mimetype file
        continue
      }
      await writer.add(file, new zip.TextReader(this.files[file]))
    }

    // Add binary file
    for (const file in this.binary_files) {
      await writer.add(file, new zip.Uint8ArrayReader(this.binary_files[file]))
    }

    // Finalize file
    await writer.close()
    return blobWriter.getData()
  }
}

if (process.argv.length === 2) {
	  console.error('Expected at least one argument!');
	  process.exit(1);
}

const filename = process.argv[2];

console.log(filename);

const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const zip = require("./zip.min.js")

const fs = require( "fs");
const { Blob } = require( "buffer");

let buffer = fs.readFileSync(filename);
let blob = new Blob([buffer]);

console.log(TXT_PROCESSING);

(async () => {

    await processEPUB(blob, filename)
    console.log(TXT_DONE);

try {

    const buffer = Buffer.from( await fixedBlobs[0].arrayBuffer() );
    fs.writeFile(dlfilenames[0], buffer, () => console.log(dlfilenames[0] + ' file saved!') );

} catch (e) {
	console.error(e)

}

})()

async function processEPUB (inputBlob, name) {
  try {
    // Load EPUB
    const epub = new EPUBBook()
    await epub.readEPUB(inputBlob)

    // Run fixing procedure
    epub.fixBodyIdLink()
    epub.fixBookLanguage()
    epub.fixStrayIMG()
    epub.fixEncoding()

    // Write EPUB
    const blob = await epub.writeEPUB()
    const idx = filenames.length
    filenames.push(name)
    fixedBlobs.push(blob)

    if (epub.fixedProblems.length > 0) {
      keepOriginalFilename ? dlfilenames.push(name) : dlfilenames.push("(fixed) " + name)
      //dlfilenames.push("(fixed) " + name)
      console.log(epub.fixedProblems)
    } else {
      keepOriginalFilename ? dlfilenames.push(name) : dlfilenames.push("(repacked) " + name)
      console.log(TXT_NO_ERROR)
    }
  } catch (e) {
    console.error(e)
    const idx = filenames.length
    filenames.push(name)
    while (fixedBlobs.length !== filenames.length) {
      fixedBlobs.push(null)
    }
    while (dlfilenames.length !== filenames.length) {
      dlfilenames.push(null)
    }
    console.log(TXT_SYS_ERROR);
  }
}
