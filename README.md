Modified web page code to run from command line in node.js so I can automate tasks. Thanks to original author's efforts.

* removed filesaver (convert blob to buffer then use fs.writeFile)
* changed DOMparser/parseFromString to jsdom
* removed muliple file handling (not needed, can run script multiple times)
* simple CLI argument (just filename for now, todo: flag for "keep original filename")
* removed webbity web bits
* await accidentally the whole async

# Kindle EPUB Fix

Amazon Send-to-Kindle service has accepted EPUB, however, for historical reason
it still assumes ISO-8859-1 encoding if no encoding is specified. This creates weird formatting errors for special characters.

This tool will try to fix your EPUB by adding the UTF-8 specification to your EPUB. It currently does
not fix other errors.

You can access this tools at https://kindle-epub-fix.netlify.app

**Warning:** This tool come at no warranty. Please still keep your original EPUB.
We don't guarantee the resulting file will be valid EPUB file, but it should.

