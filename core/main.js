/**
 * CGI-capable httpd
 *
 * This application implements configurable HTTP server featuring
 * - URL rewriting
 * - rule-based redirecting
 * - CGI script invocation
 * - HTTPS support
 *
 * @author Thomas Urban <thomas.urban@cepharum.de>
 * @package cgid
 * @license GPLv3
 *
 */

var HTTP     = require( "http" );
var HTTPS    = require( "https" );
var PATH     = require( "path" );
var FS       = require( "fs" );
var URL      = require( "url" );
var CHILD    = require( "child_process" );

var CONFIG      = require( "config" );
var LOG         = require( "log" );
var REWRITE     = require( "rewrite" );
var REDIRECT    = require( "redirect" );
var OS          = require( "os_tools" );
var HTTP_PARSER = require( "http_parser" );
var RESOLVER    = require( "resolver" );

// ----------------------------------------------------------------------------

var webRoot = PATH.resolve( __dirname, CONFIG.webRoot );
var cgiRoot = PATH.resolve( webRoot, CONFIG.cgiRoot || "." );

/**
 * Chooses one of the configured root folders (webRoot or cgiRoot) depending
 * on URL starting with configured CGI prefix or not.
 *
 * @param context {Object} context of request
 * @param url {URL} parsed URL instance
 * @return {String} absolute pathname of root folder to use on looking for file
 *                  matching request
 */

function selectRootFolder( context, url )
{
	var confPrefix = CONFIG.cgiPrefix;
	var pathname = url.pathname;
	var isCgi = ( pathname.substr( 0, confPrefix.length ) == confPrefix );

	if ( isCgi )
	{
		// remove prefix from URL
		url.pathname = pathname.substr( confPrefix.length );

		// set mark to execute file rather than retrieving its content
		context.blnExecute = true;
	}

	// choose one of the two available root folders
	return isCgi ? cgiRoot : webRoot;
}

// ----------------------------------------------------------------------------

OS.normalizeRunAsUser( function( runAsUser )
{
	var requestId = 0;

	function http_listener( request, response, blnSecure ) {

		/*
		 * create some passable context of current request to be answered
		 */

		var ctx = {

			// unique index/ID of current request (e.g. to use in related log entries)
			index : ( "00000000" + String( ++requestId ) ).substr( -8 ),

			// request to process
			request  : request,

			// response to provide
			response : response,

			// mark if request is using secure connection
			isHttps : ( blnSecure === true ),

			// mark on whether executing some script or derive a file's content
			blnExecute : false,

			// convenience method for rendering gateway/proxy error document
			renderException : function( exception ) {
				var code  = exception.status || 500;
				var title = exception.title  || "Request Failed";
				var text  = exception.text   || exception || "The server encountered malfunction on processing your request.";

				LOG.error( "%s: %d: %s - %s (%s //%s%s)", ctx.index, code, title, text, request.method, request.headers.host, request.url );

				response.writeHead( code, { "Content-Type": "text/html" } );
				response.end( [
				    "<html>",
				    "<head>",
				    "<title>",
				    title,
				    "</title>",
				    "</head>",
				    "<body>",
				    "<h1>",
				    title,
				    "</h1>",
				    "<p>",
				    text,
				    "</p>",
				    "</body>",
				    "</html>",
				].join( "\n" ) );
			},
		};


		// log request
		LOG.info( "%s: %s %s %s%s", ctx.index, request.method, request.headers.host, request.url, ctx.isHttps ? " (https)" : "" );


		// try to rewrite URL
		request.url = REWRITE.processRequest( ctx, request.originalUrl = request.url );

		// optionally redirect URL
		if ( !REDIRECT.processRequest( ctx ) )
		{
			// no redirection -> continue processing request

			// parse its URL
			var url = URL.parse( request.url, false );

			// choose root folder
			var basedir = selectRootFolder( ctx, url );

			LOG.debug( "%s: %s is addressing resource in %s %s", ctx.index, url.pathname, ctx.blnExecute ? "cgiRoot" : "webRoot", basedir );

			// look for matching file
			RESOLVER.resolvePathname( basedir, url.pathname, !ctx.blnExecute, function( error, pathname, stat, pathinfo )
			{
				if ( error || !pathname )
				{
					/*
					 * failed to map pathname of request URL into local file's
					 * pathname to retrieve or execute
					 */

					LOG.error( "%s: %s: %s", ctx.index, error.message, pathname || url.pathname );

					switch ( error.type )
					{
						case "notfound" :
							ctx.renderException( {
								status: 404,
								title: "Not Found",
								text: "Requested file does not exist or is not available."
							} );
							break;

						case "invalid" :
							ctx.renderException( {
								status: 400,
								title: "Bad Request",
								text: "Your request has been rejected due to invalid pathname."
							} );
							break;

						case "failed" :
							ctx.renderException( {
								status: 403,
								title: "Forbidden",
								text: "You mustn't access requested file or script."
							} );
							break;

						default :
							ctx.renderException( {
								status: 500,
								title: "Internal Error",
								text: "Processing your request failed due to server-side malfunction."
							} );
					}
				}
				else if ( ctx.blnExecute )
				{
					/*
					 * request is selecting available script file to execute
					 */

					LOG.info( "%s: executing %s", ctx.index, pathname );

					var script = CHILD.spawn( pathname, [], {
						cwd: PATH.dirname( pathname ),
						uid: runAsUser || stat.uid,
						stdio: "pipe",
						env: {
							CONTENT_LENGTH: request.headers["content-length"] || 0,
							CONTENT_TYPE: request.headers["content-type"] || "application/octet-stream",
							DOCUMENT_ROOT: CONFIG.webRoot || "/tmp",
							GATEWAY_INTERFACE: "1.1",
							HTTP_ACCEPT: request.headers["accept"],
							HTTP_ACCEPT_CHARSET: request.headers["accept-charset"],
							HTTP_ACCEPT_ENCODING: request.headers["accept-encoding"],
							HTTP_ACCEPT_LANGUAGE: request.headers["accept-language"],
							HTTP_CONNECTION: request.headers["connection"],
							HTTP_COOKIE: request.headers["cookie"],
							HTTP_HOST: request.headers["host"],
							HTTP_REFERER: request.headers["referer"],
							HTTP_USER_AGENT: request.headers["user-agent"],
							PATH_INFO: pathinfo,
							PATH_TRANSLATED: pathname,
							QUERY_STRING: url.query || "",
							REMOTE_ADDRESS: request.socket.remoteAddress,
							REMOTE_HOST: undefined,
							REMOTE_IDENT: undefined,
							REMOTE_PORT: request.socket.remotePort,
							REMOTE_USER: undefined,
							REQUEST_METHOD: request.method,
							REQUEST_URI: request.originalUrl,
							SCRIPT_FILENAME: pathname,
							SCRIPT_NAME: CONFIG.cgiPrefix + "/" + PATH.relative( cgiRoot, pathname ).replace( /[\\]/g, "/" ),
							SERVER_ADDR: request.socket.localAddress,
							SERVER_ADMIN: CONFIG.envServerAdmin,
							SERVER_NAME: CONFIG.envServerName,
							SERVER_PORT: request.socket.localPort,
							SERVER_PROTOCOL: "HTTP/" + request.httpVersion,
							SERVER_SIGNATURE: CONFIG.envServerSignature,
							SERVER_SOFTWARE: CONFIG.envServerSoftware,
						}
					} );

					// render exception on failed invocation of script
					script.on( "error", function( error )
					{
						LOG.error( "%s: failed to execute %s: %s", ctx.index, pathname, error );

						ctx.renderException( {
							status: 500,
							title: "Internal Error",
							text: "The server encountered error on trying to process your request."
						} );
					} );

					// capture script's output on stderr to log it line by line
					script.stderr.on( "data", function( chunk )
					{
						chunk.toString( ).split( /\n/ ).forEach( function( line )
						{
							LOG.debug( "%s: %s", ctx.index, line );
						} );
					} );


					// pass request data to script on its stdin
					request.pipe( script.stdin );


					/*
					 * capture output of script on stdout considered very similar to HTTP message
					 */

					var parser = HTTP_PARSER.createParser( true, function( headers )
					{
						// set response header
						var status = parseInt( headers.status ) || 200;
						delete headers.status;

						LOG.debug( "%s: script requests HTTP status %s", ctx.index, status );
						response.writeHead( status, headers );

						// parser might have collected some leading part of body
						// -> don't miss to pass it to client
						response.write( this.rawBody() );

						// and pipe all succeeding output of script into response directly
						script.stdout.pipe( response );

						// drop reference on parser as it won't be used
						// for parsing anymore
						parser = undefined;
					} );

					script.stdout.on( "data", function( chunk )
					{
						// feed HTTP message parser unless disabled before
						parser && parser.feed( chunk );
					} );


					/*
					 * log statistical information on script exiting
					 */

					var exitCode = null;
					var finished = false;

					function logOnFinish( )
					{
						if ( exitCode && finished )
						{
							LOG.info( "%s: script exited with %d (signal %s)", ctx.index, exitCode[0], exitCode[1] );
							LOG.debug( "%s: in %s, out %s", ctx.index, request.socket.bytesRead, request.socket.bytesWritten );
						}
					}

					script.on( "exit", function( code, signal )
					{
						exitCode = [ code, signal ];
						logOnFinish( );
					} );

					script.stdout.on( "end", function( )
					{
						finished = true;
						logOnFinish( );
					} );
				}
				else
				{
					/*
					 * request is selecting available file to retrieve as-is
					 */

					LOG.debug( "%s: retrieving file %s", ctx.index, pathname );

					// retrieve content of selected and available file
					var ext  = PATH.extname( pathname ).substr( 1 );
					var map  = CONFIG.mimeTypes;
					var mime = ( ext in map ? map[ext] : map["*"] ) || "application/octet-stream";

					response.writeHead( 200, {
						"Content-Type": mime,
					} );

					try
					{
						FS.createReadStream( pathname ).pipe( response );
					}
					catch ( error )
					{
						LOG.error( "%s: on retrieving file %s: %s", ctx.index, pathname, error );

						ctx.renderException( {
							status: 403,
							title: "Forbidden",
							text: "Requested file isn't available."
						} );
					}
				}
			} );
		}
	}

	// ----------------------------------------------------------------------------

	// create HTTP listener
	HTTP
		.createServer( http_listener )
		.listen( 80, CONFIG.ipAddress );


	if ( CONFIG.enableHttps )
	{
		// use wrapper on HTTPS request for adjusting context of shared HTTP listener
		function https_listener( request, response )
		{
			return http_listener( request, response, true );
		}

		try
		{
			// create HTTPS listener
			HTTPS
				.createServer( {
						key: CONFIG.certificateKey || FS.readFileSync( CONFIG.certificateKeyFilename ),
						cert: CONFIG.certificate || FS.readFileSync( CONFIG.certificateFilename )
					}, https_listener )
				.listen( 443, CONFIG.ipAddress );
		}
		catch ( error )
		{
			console.error( "failed to create HTTPS server: " + error );
			process.exit( 2 );
		}
	}
} );
