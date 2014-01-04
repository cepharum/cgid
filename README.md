cgid
====

Simple HTTP server for providing CGI-based web sites


# Motivation

Recently I was trying to install GNU mailman in a virtual machine running
Ubuntu 12.04 LTS Precise Pangolin. mailman is including web interface for
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
(vm-http-proxy)[http://github.com/cepharum/vm-http-proxy] I decided to start
my own solution relying on Node.JS, only. cgid is the result ...


