# cgid

_Simple HTTP server for providing CGI-based web sites_


## Motivation

Recently I was trying to install [GNU mailman](http://www.list.org/) in a virtual machine running
[Ubuntu 12.04 LTS Precise Pangolin](http://ubuntu.com). mailman is including web interface for
managing lists, subscriptions and mailing archives. This interface relies on
CGI.

For going to be used quite little I decided to use smaller web server instead
of Apache. I've been quite happy with nginx for quite some time and so decided
to go with it this time again. But nginx obviously isn't supporting CGI directly.
It rather relies on a separate local-only web server to be covered in reverse
proxy mode. For the sake of keeping installation small and simple this pairing
of two web servers wasn't attractive to me.

Node.JS includes a quickly implemented HTTP service library and it's known to
run fast presuming proper asynchronous implementation suitable for the
single-threaded event-driven design of Node.JS. After working on
[vm-http-proxy](http://github.com/cepharum/vm-http-proxy) I decided to start
my own solution relying on Node.JS, only. cgid is the result ...


### Performance

At this stage of development I can't provide any benchmarking results though I've 
tried my best to optimize code for speed. Node.JS is known to compete with 
other thin web servers like nginx, though this comparison must be biased according
to actually featured functionalities. I expect this cgid to perform better than
any Apache-based setup. I don't know much about performance of nginx+thttpd, either.
But that pairing requires useless interaction of two web servers wasting essential
time.


### Testing

The implementation has been tested under Ubuntu Linux but is considered to work
with other operating systems supported by Node.JS as well. Under Windows some 
configuration has to be adopted, probably.


## Installation

### System Requirements

The implementation relies on Node.JS which isn't part of this project or 
any related release. You may download latest release of [Node.JS](http://nodejs.org). 
There are versions for Linux, Mac OS X and Windows.

### Setting up cgid

1. Fetch master branch from github:
       ```
       $ wget https://github.com/cepharum/cgid/archive/master.zip
       ```
2. Unzip it:
       ```
       $ unzip master.zip
       ```
3. Adjust startup script to be executable:
       ```
       $ chmod 0755 cgid-master/run.sh
       ```
4. Derive configuration from provided template:
       ```
       $ cp cgid-master/node_modules/config.js.dist cgid-master/node_modules/config.js
       ```
4. Adjust runtime configuration to your needs (see below):
       ```
       $ nano cgid-master/node_modules/config.js
       ```
5. Invoke service for testing:
       ```
       $ sudo cgid-master/run.sh
       ```
6. **Ubuntu only:** Install as a service
   1. Check and adopt pathnames in Upstart job definition:
          ```
          $ nano cgid-master/cgid.conf
          ```
   2. Install job definition:
          ```
          $ sudo cp cgid-master/cgid.conf /etc/init
          ```
   3. Start service:
          ```
          $ start cgid
          ```

## Runtime Configuration

All configuration is available in file node_modules/config.js. You may 
adjust it to fit your needs. This includes integration of functions
querying and calculating your individual configuration.

See the comments in that file to learn more about available
configuration properties.

### Example: GNU mailman

Returning to initial motivation here comes example for setting up mailman web interface.

The following example for `node_modules/config.js` prepares cgid to provide webinterface 
of GNU mailman installed in `/var/lib/mailman`.

       module.exports = {
              webRoot : "/var/lib/mailman",
              cgiRoot : "cgi-bin",
              cgiPrefix : "/mailman",
              runAsUser : "www-data",
              enableHttps : false,
              minLogLevel : "info",
              // required for accessing archives
              followSymlinks : true,
              mimeTypes : {
                         txt: "text/plain",
                         html: "text/html",
                         xhtml: "application/xhtml+xml",
                         xml: "application/xml",
                         xsl: "application/xslt+xml",
                         js: "text/javascript",
                         css: "text/css",
                         jpg: "image/jpeg",
                         jpeg: "image/jpeg",
                         png: "image/png",
                         gif: "image/gif",
                         pdf: "application/pdf",
                         zip: "application/zip"
                         },
              rewrites : [
                     [ /^\/cgi-bin\/mailman\/(.+)$/, "/mailman/$1", true ],
                     [ /^((\/cgi-bin)?\/mailman)?\/?$/, "/mailman/listinfo", true ],
                     [ /^\/images\/mailman(.*)$/, "/icons$1", true ],
                     [ /^\/pipermail(.*)$/, "/archives/public$1", true ],
                     ]
       };

In addition URL format used by GNU mailman must be changed in file `/var/lib/mailman/Mailman/mm_cfg.py`. Replace the following options in that files accordingly:

       DEFAULT_URL_PATTERN = 'http://%s/mailman/'
       PRIVATE_ARCHIVE_URL = '/mailman/private'
       IMAGE_LOGOS         = '/icons/'

After restarting cgid and GNU mailman you're done and so you should be able to access web interface of your GNU mailman installation using the web browser of your choice.
