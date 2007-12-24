/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Microsummarizer.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Myk Melez <myk@mozilla.org> (Original Author)
 *  Simon Bünzli <zeniko@gmail.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * A resource (page, microsummary, generator, etc.) identifiable by URI.
 * This object abstracts away much of the code for loading resources
 * and parsing their content if they are XML or HTML.
 * 
 * @constructor
 * 
 * @param   uri
 *          the location of the resource
 *
 */
function MicrosummaryResource(uri) {
  // Make sure we're not loading javascript: or data: URLs, which could
  // take advantage of the load to run code with chrome: privileges.
  // XXX Perhaps use nsIScriptSecurityManager.checkLoadURI instead.
  if (uri.scheme != "http" && uri.scheme != "https" && uri.scheme != "file"
      && uri.spec != "chrome://coop/content/facebook-get-links.xsl")
    throw NS_ERROR_DOM_BAD_URI;

  this._uri = uri;
}

MicrosummaryResource.prototype = {
  // IO Service
  __ios: null,
  get _ios() {
    if (!this.__ios)
      this.__ios = Cc["@mozilla.org/network/io-service;1"].
                   getService(Ci.nsIIOService);
    return this.__ios;
  },

  _uri: null,
  get uri() {
    return this._uri;
  },

  _content: null,
  get content() {
    return this._content;
  },

  _contentType: null,
  get contentType() {
    return this._contentType;
  },

  _isXML: false,
  get isXML() {
    return this._isXML;
  },

  // A function to call when we finish loading/parsing the resource.
  _loadCallback: null,

  // A function to call if we get an error while loading/parsing the resource.
  _errorCallback: null,

  // A hidden iframe to parse HTML content.
  _iframe: null,

  // Implement notification callback interfaces so we can suppress UI
  // and abort loads for bad SSL certs and HTTP authorization requests.
  
  // Interfaces this component implements.
  interfaces: [Ci.nsIBadCertListener,
               Ci.nsIAuthPromptProvider,
               Ci.nsIAuthPrompt,
               Ci.nsIPrompt,
               Ci.nsIProgressEventSink,
               Ci.nsIInterfaceRequestor,
               Ci.nsISupports],

  // nsISupports

  QueryInterface: function MSR_QueryInterface(iid) {
    if (!this.interfaces.some( function(v) { return iid.equals(v) } ))
      throw Cr.NS_ERROR_NO_INTERFACE;

    // nsIAuthPrompt and nsIPrompt need separate implementations because
    // their method signatures conflict.  The other interfaces we implement
    // within MicrosummaryResource itself.
    switch(iid) {
    case Ci.nsIAuthPrompt:
      return this.authPrompt;
    case Ci.nsIPrompt:
      return this.prompt;
    default:
      return this;
    }
  },

  // nsIInterfaceRequestor
  
  getInterface: function MSR_getInterface(iid) {
    return this.QueryInterface(iid);
  },

  // nsIBadCertListener

  // Suppress UI and abort secure loads from servers with bad SSL certificates.
  
  confirmUnknownIssuer: function MSR_confirmUnknownIssuer(socketInfo, cert, certAddType) {
    return false;
  },

  confirmMismatchDomain: function MSR_confirmMismatchDomain(socketInfo, targetURL, cert) {
    return false;
  },

  confirmCertExpired: function MSR_confirmCertExpired(socketInfo, cert) {
    return false;
  },

  notifyCrlNextupdate: function MSR_notifyCrlNextupdate(socketInfo, targetURL, cert) {
  },

  // Suppress UI and abort loads for files secured by authentication.

  // Auth requests appear to succeed when we cancel them (since the server
  // redirects us to a "you're not authorized" page), so we have to set a flag
  // to let the load handler know to treat the load as a failure.
  __authFailed: false,
  get _authFailed()         { return this.__authFailed },
  set _authFailed(newValue) { this.__authFailed = newValue },

  // nsIAuthPromptProvider
  
  getAuthPrompt: function(aPromptReason, aIID) {
    this._authFailed = true;
    throw Cr.NS_ERROR_NOT_AVAILABLE;
  },

  // HTTP always requests nsIAuthPromptProvider first, so it never needs
  // nsIAuthPrompt, but not all channels use nsIAuthPromptProvider, so we
  // implement nsIAuthPrompt too.

  // nsIAuthPrompt

  get authPrompt() {
    var resource = this;
    return {
      interfaces: [Ci.nsIPrompt, Ci.nsISupports],
      QueryInterface: function(iid) {
        if (!this.interfaces.some( function(v) { return iid.equals(v) } ))
          throw Cr.NS_ERROR_NO_INTERFACE;
        return this;
      },
      prompt: function(dialogTitle, text, passwordRealm, savePassword, defaultText, result) {
        resource._authFailed = true;
        return false;
      },
      promptUsernameAndPassword: function(dialogTitle, text, passwordRealm, savePassword, user, pwd) {
        resource._authFailed = true;
        return false;
      },
      promptPassword: function(dialogTitle, text, passwordRealm, savePassword, pwd) {
        resource._authFailed = true;
        return false;
      }
    };
  },

  // nsIPrompt

  get prompt() {
    var resource = this;
    return {
      interfaces: [Ci.nsIPrompt, Ci.nsISupports],
      QueryInterface: function(iid) {
        if (!this.interfaces.some( function(v) { return iid.equals(v) } ))
          throw Cr.NS_ERROR_NO_INTERFACE;
        return this;
      },
      alert: function(dialogTitle, text) {
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
      },
      alertCheck: function(dialogTitle, text, checkMessage, checkValue) {
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
      },
      confirm: function(dialogTitle, text) {
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
      },
      confirmCheck: function(dialogTitle, text, checkMessage, checkValue) {
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
      },
      confirmEx: function(dialogTitle, text, buttonFlags, button0Title, button1Title, button2Title, checkMsg, checkValue) {
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
      },
      prompt: function(dialogTitle, text, value, checkMsg, checkValue) {
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
      },
      promptPassword: function(dialogTitle, text, password, checkMsg, checkValue) {
        resource._authFailed = true;
        return false;
      },
      promptUsernameAndPassword: function(dialogTitle, text, username, password, checkMsg, checkValue) {
        resource._authFailed = true;
        return false;
      },
      select: function(dialogTitle, text, count, selectList, outSelection) {
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
      }
    };
  },

  // XXX We implement nsIProgressEventSink because otherwise bug 253127
  // would cause too many extraneous errors to get reported to the console.
  // Fortunately this doesn't screw up XMLHttpRequest, because it ensures
  // that its implementation of nsIProgressEventSink will always get called
  // in addition to whatever notification callbacks we set on the channel.

  // nsIProgressEventSink

  onProgress: function(aRequest, aContext, aProgress, aProgressMax) {},
  onStatus: function(aRequest, aContext, aStatus, aStatusArg) {},

  /**
   * Initialize the resource from an existing DOM document object.
   * 
   * @param   document
   *          a DOM document object
   *
   */
  initFromDocument: function MSR_initFromDocument(document) {
    this._content = document;
    this._contentType = document.contentType;

    // Normally we set this property based on whether or not
    // XMLHttpRequest parsed the content into an XML document object,
    // but since we already have the content, we have to analyze
    // its content type ourselves to see if it is XML.
    this._isXML = (this.contentType == "text/xml" ||
                   this.contentType == "application/xml" ||
                   /^.+\/.+\+xml$/.test(this.contentType));
  },

  /**
   * Destroy references to avoid leak-causing cycles.  Instantiators must call
   * this method on all instances they instantiate once they're done with them.
   *
   */
  destroy: function MSR_destroy() {
    this._uri = null;
    this._content = null;
    this._loadCallback = null;
    this._errorCallback = null;
    this._loadTimer = null;
    this._authFailed = false;
    if (this._iframe) {
      if (this._iframe && this._iframe.parentNode)
        this._iframe.parentNode.removeChild(this._iframe);
      this._iframe = null;
    }
  },

  /**
   * Load the resource.
   * 
   * @param   loadCallback
   *          a function to invoke when the resource finishes loading
   * @param   errorCallback
   *          a function to invoke when an error occurs during the load
   *
   */
  load: function MSR_load(loadCallback, errorCallback) {
    this._log(this.uri.spec + " loading");
  
    this._loadCallback = loadCallback;
    this._errorCallback = errorCallback;

    var request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
  
    var loadHandler = {
      _self: this,
      handleEvent: function MSR_loadHandler_handleEvent(event) {
        if (this._self._loadTimer)
          this._self._loadTimer.cancel();

        if (this._self._authFailed) {
          // Technically the request succeeded, but we treat it as a failure,
          // since we aren't able to handle HTTP authentication.
          this._self._log(this._self.uri.spec + " load failed; HTTP auth required");
          try     { this._self._handleError(event) }
          finally { this._self = null }
        }
        else if (event.target.channel.contentType == "multipart/x-mixed-replace") {
          // Technically the request succeeded, but we treat it as a failure,
          // since we aren't able to handle multipart content.
          this._self._log(this._self.uri.spec + " load failed; contains multipart content");
          try     { this._self._handleError(event) }
          finally { this._self = null }
        }
        else {
          this._self._log(this._self.uri.spec + " load succeeded; invoking callback");
          try     { this._self._handleLoad(event) }
          finally { this._self = null }
        }
      }
    };

    var errorHandler = {
      _self: this,
      handleEvent: function MSR_errorHandler_handleEvent(event) {
        if (this._self._loadTimer)
          this._self._loadTimer.cancel();

        this._self._log(this._self.uri.spec + " load failed");
        try     { this._self._handleError(event) }
        finally { this._self = null }
      }
    };

    // cancel loads that take too long
    // timeout specified in seconds at browser.microsummary.requestTimeout,
    // or 300 seconds (five minutes)
    var timeout = 300 * 1000;
    var timerObserver = {
      _self: this,
      observe: function MSR_timerObserver_observe() {
        this._self._log("timeout loading microsummary resource " + this._self.uri.spec + ", aborting request");
        request.abort();
        try     { this._self.destroy() }
        finally { this._self = null }
      }
    };
    this._loadTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this._loadTimer.init(timerObserver, timeout, Ci.nsITimer.TYPE_ONE_SHOT);

    request = request.QueryInterface(Ci.nsIDOMEventTarget);
    request.addEventListener("load", loadHandler, false);
    request.addEventListener("error", errorHandler, false);
    
    request = request.QueryInterface(Ci.nsIXMLHttpRequest);
    request.open("GET", this.uri.spec, true);
    request.setRequestHeader("X-Moz", "microsummary");

    // Register ourselves as a listener for notification callbacks so we
    // can handle authorization requests and SSL issues like cert mismatches.
    // XMLHttpRequest will handle the notifications we don't handle.
    request.channel.notificationCallbacks = this;

    // If this is a bookmarked resource, and the bookmarks service recorded
    // its charset in the bookmarks datastore the last time the user visited it,
    // then specify the charset in the channel so XMLHttpRequest loads
    // the resource correctly.
    try {
      var resolver = Cc["@mozilla.org/embeddor.implemented/bookmark-charset-resolver;1"].
                     getService(Ci.nsICharsetResolver);
      if (resolver) {
        var charset = resolver.requestCharset(null, request.channel, {}, {});
        if (charset != "");
          request.channel.contentCharset = charset;
      }
    }
    catch(ex) {}

    request.send(null);
  },

  _handleLoad: function MSR__handleLoad(event) {
    var request = event.target;

    if (request.responseXML) {
      this._isXML = true;
      // XXX Figure out the parsererror format and log a specific error.
      if (request.responseXML.documentElement.nodeName == "parsererror")
        throw(request.channel.originalURI.spec + " contains invalid XML");
      this._content = request.responseXML;
      this._contentType = request.channel.contentType;
      this._loadCallback(this);
    }

    else if (request.channel.contentType == "text/html") {
      this._parse(request.responseText);
    }

    else {
      // This catches text/plain as well as any other content types
      // not accounted for by the content type-specific code above.
      this._content = request.responseText;
      this._contentType = request.channel.contentType;
      this._loadCallback(this);
    }
  },
  
  _handleError: function MSR__handleError(event) {
    // Call the error callback, then destroy ourselves to prevent memory leaks.
    try     { if (this._errorCallback) this._errorCallback() }
    finally { this.destroy() }
  },

  /**
   * Parse a string of HTML text.  Used by _load() when it retrieves HTML.
   * We do this via hidden XUL iframes, which according to bz is the best way
   * to do it currently, since bug 102699 is hard to fix.
   * 
   * @param   htmlText
   *          a string containing the HTML content
   *
   */
  _parse: function MSR__parse(htmlText) {
    // Find a window to stick our hidden iframe into.
    var windowMediator = Cc['@mozilla.org/appshell/window-mediator;1'].
                         getService(Ci.nsIWindowMediator);
    var window = windowMediator.getMostRecentWindow("navigator:browser");
    // XXX We can use other windows, too, so perhaps we should try to get
    // some other window if there's no browser window open.  Perhaps we should
    // even prefer other windows, since there's less chance of any browser
    // window machinery like throbbers treating our load like one initiated
    // by the user.
    if (!window)
      throw(this._uri.spec + " can't parse; no browser window");
    var document = window.document;
    var rootElement = document.documentElement;
  
    // Create an iframe, make it hidden, and secure it against untrusted content.
    this._iframe = document.createElement('iframe');
    this._iframe.setAttribute("collapsed", true);
    this._iframe.setAttribute("type", "content");
  
    // Insert the iframe into the window, creating the doc shell.
    rootElement.appendChild(this._iframe);

    // When we insert the iframe into the window, it immediately starts loading
    // about:blank, which we don't need and could even hurt us (for example
    // by triggering bugs like bug 344305), so cancel that load.
    var webNav = this._iframe.docShell.QueryInterface(Ci.nsIWebNavigation);
    webNav.stop(Ci.nsIWebNavigation.STOP_NETWORK);

    // Turn off JavaScript and auth dialogs for security and other things
    // to reduce network load.
    // XXX We should also turn off CSS.
    this._iframe.docShell.allowJavascript = false;
    this._iframe.docShell.allowAuth = false;
    this._iframe.docShell.allowPlugins = false;
    this._iframe.docShell.allowMetaRedirects = false;
    this._iframe.docShell.allowSubframes = false;
    this._iframe.docShell.allowImages = false;
  
    var parseHandler = {
      _self: this,
      handleEvent: function MSR_parseHandler_handleEvent(event) {
        event.target.removeEventListener("DOMContentLoaded", this, false);
        try     { this._self._handleParse(event) }
        finally { this._self = null }
      }
    };
 
    // Convert the HTML text into an input stream.
    var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
                    createInstance(Ci.nsIScriptableUnicodeConverter);
    converter.charset = "UTF-8";
    var stream = converter.convertToInputStream(htmlText);

    // Set up a channel to load the input stream.
    var channel = Cc["@mozilla.org/network/input-stream-channel;1"].
                  createInstance(Ci.nsIInputStreamChannel);
    channel.setURI(this._uri);
    channel.contentStream = stream;

    // Load in the background so we don't trigger web progress listeners.
    var request = channel.QueryInterface(Ci.nsIRequest);
    request.loadFlags |= Ci.nsIRequest.LOAD_BACKGROUND;

    // Specify the content type since we're not loading content from a server,
    // so it won't get specified for us, and if we don't specify it ourselves,
    // then Firefox will prompt the user to download content of "unknown type".
    var baseChannel = channel.QueryInterface(Ci.nsIChannel);
    baseChannel.contentType = "text/html";

    // Load as UTF-8, which it'll always be, because XMLHttpRequest converts
    // the text (i.e. XMLHTTPRequest.responseText) from its original charset
    // to UTF-16, then the string input stream component converts it to UTF-8.
    baseChannel.contentCharset = "UTF-8";

    // Register the parse handler as a load event listener and start the load.
    // Listen for "DOMContentLoaded" instead of "load" because background loads
    // don't fire "load" events.
    this._iframe.addEventListener("DOMContentLoaded", parseHandler, true);
    var uriLoader = Cc["@mozilla.org/uriloader;1"].getService(Ci.nsIURILoader);
    uriLoader.openURI(channel, true, this._iframe.docShell);
  },

  /**
   * Handle a load event for the iframe-based parser.
   * 
   * @param   event
   *          the event object representing the load event
   *
   */
  _handleParse: function MSR__handleParse(event) {
    // XXX Make sure the parse was successful?

    this._content = this._iframe.contentDocument;
    this._contentType = this._iframe.contentDocument.contentType;
    this._loadCallback(this);
  },

  _log: function MSR__log(message) {
    CoopGlobal.log("msr: " + message);
  }
};
