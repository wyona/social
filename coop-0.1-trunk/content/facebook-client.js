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
 * The Original Code is The Coop.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Myk Melez <myk@mozilla.org>
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

function FacebookClient() {}

FacebookClient.prototype = {
  v: "1.0",
  desktop: true,
  serverAddress: "http://api.facebook.com/restserver.php",
  apiKey: null,
  secret: null,
  sessionKey: null,
  sessionSecret: null,
  uid: null,
  async: true,
  loadHandler: null,
  errorHandler: null,

  init: function fbc_init(apiKey, secret, sessionKey, sessionSecret, uid, async, loadHandler, errorHandler) {
    // These parameters provide the basic information necessary to make
    // any API call to Facebook.
    if (!apiKey)
      throw("FacebookClient.init: missing required parameter: apiKey");
    if (!secret)
      throw("FacebookClient.init: missing required parameter: secret");
    this.apiKey = apiKey;
    this.secret = secret;

    // If there's a preexisting session, these two parameters provide
    // the necessary session information.
    if (sessionKey)
      this.sessionKey = sessionKey;
    if (sessionSecret)
      this.sessionSecret = sessionSecret;
    if (uid)
      this.uid = uid;

    // These parameters determine how calls get made and the results
    // get returned.  The async parameter determines whether calls
    // are synchronous or asynchronous.  By default, they are asynchronous.
    // The load and error handlers, if any, get called by default
    // when an asynchronous request completes.
    if (async)
      this.async = async;
    if (loadHandler)
      this.loadHandler = loadHandler;
    if (errorHandler)
      this.errorHandler = errorHandler;
  },

  auth_createToken: function fbc_auth_createToken() {
    this._log("auth_createToken");
    return this.callMethod("facebook.auth.createToken", {});
  },
  
  auth_getSession: function fbc_auth_getSession(auth_token) {
    this._log("auth_getSession");
    return this.callMethod("facebook.auth.getSession", { auth_token: auth_token });
  },

  /**
   * Returns events according to the filters specified.
   * @param int $uid Optional: User associated with events.  
   *   A null parameter will default to the session user.
   * @param array $eids Optional: Filter by these event ids.
   *   A null parameter will get all events for the user.
   * @param int $start_time Optional: Filter with this UTC as lower bound.  
   *   A null or zero parameter indicates no lower bound.
   * @param int $end_time Optional: Filter with this UTC as upper bound. 
   *   A null or zero parameter indicates no upper bound.
   * @param string $rsvp_status Optional: Only show events where the given uid
   *   has this rsvp status.  This only works if you have specified a value for
   *   $uid.  Values are as in events.getMembers.  Null indicates to ignore
   *   rsvp status when filtering.
   * @return array of events
   */
  events_get: function fbc_events_get(uid, eids, start_time, end_time, rsvp_status) {
    this.callMethod("facebook.events.get",
                    { uid: uid,
                      eids: eids,
                      start_time: start_time,
                      end_time: end_time,
                      rsvp_status: rsvp_status },
                    loadHandler,
                    errorHandler);
  },
  events_getMembers: function fbc_events_getMembers(eid) {},
  fql_query: function fbc_fql_query(query) {},
  friends_areFriends: function fbc_friends_areFriends(uids1, uids2) {},
  
  /**
   * Returns the friends of the current session user.
   * @return array of friends
   */
  friends_get: function fbc_friends_get(loadHandler) {
    this.callMethod("facebook.friends.get", {}, loadHandler);
  },
  
  friends_getAppUsers: function fbc_friends_getAppUsers() {},
  groups_get: function fbc_groups_get() {},
  groups_getMembers: function fbc_groups_getMembers() {},
  notifications_get: function fbc_notifications_get() {},
  
  photos_get: function fbc_photos_get(subj_id, aid, pids, loadHandler) {
    this.callMethod("facebook.photos.get", params, loadHandler);
  },
  
  photos_getAlbums: function fbc_photos_getAlbums(uid, aids) {},
  photos_getTags: function fbc_photos_getTags(pids) {},
  update_decodeIDs: function fbc_update_decodeIDs(ids) {},
  
  users_getInfo: function fbc_users_getInfo(uids, fields, loadHandler) {
    this.callMethod("facebook.users.getInfo", params, loadHandler);
  },
  
  users_getLoggedInUser: function fbc_users_getLoggedInUser() {},

  callMethod: function fbc_callMethod(method, params) {
    this._log("callMethod: " + method);
    return this.postRequest(method, params, this.async, this.loadHandler, this.errorHandler);
  },

  postRequest: function fbc_postRequest(method, params, async, loadHandler, errorHandler) {
    this._log("postRequest: " + method);

    // Add the necessary information to the params.
    params.method = method;
    params.session_key = this.sessionKey;
    params.api_key = this.apiKey;
    if (!params.v)
      params.v = this.v;
    params.call_id = new Date().getTime();
    // XXX Should this be configurable?
    params.format = "json";

    // Choose the right secret.  Normally this is the session secret,
    // but if we're calling an "auth" method and we're in desktop mode
    // (which we always are at this point), then we use the app secret.
    var secret;
    if (this.desktop && method != "facebook.auth.getSession"
                     && method != "facebook.auth.createToken")
      secret = this.sessionSecret;
    else
      secret = this.secret;

    // The Facebook API requires each method call to be accompanied by
    // a "signature" that is a hash of the secret appended to the joined,
    // sorted key=value param pairs, so here we generate that signature
    // and add it to the params.
    var dataToHash =
      [key for (key in params)].
      sort().
      map(function(key) { return key + "=" + params[key] }).
      join("") + secret;
    params.sig = this._md5(dataToHash);

    // Convert the params to a string suitable for POSTing.  Unlike the string
    // we use to generate the signature, these pairs are separated by ampersands,
    // their values are URI-encoded, and they don't need to be sorted first.
    // And, of course, there's one extra param: the signature itself.
    var postData =
      [key for (key in params)].
      map(function(key) { return key + "=" + encodeURIComponent(params[key]) }).
      join("&");

    var request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();

    request = request.QueryInterface(Ci.nsIDOMEventTarget);
    if (loadHandler)
      request.addEventListener("load", loadHandler, false);
    if (errorHandler)
      request.addEventListener("error", errorHandler, false);
    
    request = request.QueryInterface(Ci.nsIXMLHttpRequest);
    request.open("POST", this.serverAddress, async);
    //request.setRequestHeader("User-Agent", "Facebook API JS Client");
    request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    request.setRequestHeader("Content-Length", postData.length);
    request.send(postData);
    return request;
  },

  _validJSON: /^("(\\.|[^"\\\n\r])*?"|[,:{}\[\]0-9.\-+Eaeflnr-u \n\r\t])+?$/,

  /**
   * Parse a JSON string and return the JavaScript object or array result.
   * 
   * This can throw, so callers should be conscious about exceptions.
   *
   * Adapted from Crockford's public domain code at http://www.json.org/json.js
   * and also the JSON code in nsSearchSuggestions.js.
   * 
   **/
  parseJSON: function fbc__parseJSON(string) {
    // Run the text against a regular expression which looks for non-JSON
    // characters. We are especially concerned with '()' and 'new' because
    // they can cause invocation, and '=' because it can cause mutation.
    // But just to be safe, we will reject all unexpected characters.
    if (!this._validJSON.test(string))
      throw "invalid JSON";

    // Evaluate the JSON string in a site-specific sandbox for added security.
    var IOService = Cc["@mozilla.org/network/io-service;1"].
                    getService(Ci.nsIIOService);
    var sandboxURI = IOService.newURI(this.serverAddress, null, null);
    var sandbox = new Components.utils.Sandbox(sandboxURI.prePath);

    return Components.utils.evalInSandbox("(" + string + ")", sandbox);
  },

  /**
   * Convert a Facebook XML tree into a JavaScript data structure.
   * Facebook trees are simple XML in which nodes represent strings, arrays,
   * or hashes, and both container types can contain any of the three types
   * in any combination.
   *
   * This is less useful now that Facebook supports JSON.
   *
   * In theory consumers could use E4X instead.
   **/
  convertXML: function convertXML(node) {
    // Unexpected: a text node.
    // We should never run into one of these, since text nodes are supposed
    // to appear as the only children of element nodes, and we stop recursing
    // and return their value when we reach their parent.  But if we do reach
    // one of these for some reason, we write a warning to the console
    // and return the text, which is hopefully what the consumer wants.
    if (node.nodeType == node.TEXT_NODE) {
      this._log("Warning: XMLToJS encountered text node " + node.nodeValue);
      return node.nodeValue;
    }

    // Array: a node with a "list" attribute (could be an empty array).
    else if (node.hasAttribute("list"))
      return [this.convertXML(childNode) for (childNode in node.childNodes)];

    // Null: an XML element that does not contain anything.
    else if (node.childNodes.length == 0)
      return null;

    // String: an XML element that contains a single text node.
    else if (node.childNodes.length == 1 && node.childNodes[0].nodeType == node.TEXT_NODE)
      return node.childNodes[0].nodeValue;

    // Hash: everything else.
    else {
      var hash = {};
      for (var i = 0; i < node.childNodes.length; i++) {
        var childNode = node.childNodes[i];
        hash[childNode.nodeName] = this.convertXML(childNode);
      }
      return hash;
    }
  },

  __hasher: null,
  get _hasher() {
    if (!this.__hasher)
      this.__hasher = Cc["@mozilla.org/security/hash;1"].
                      createInstance(Ci.nsICryptoHash);
    return this.__hasher;
  },

  _md5: function fbc__md5(data) {
    // Convert the data string into an array of Unicode character codes.
    data = data.split("").map(function(chr) { return chr.charCodeAt(0) });

    this._hasher.init(Ci.nsICryptoHash.MD5);
    this._hasher.update(data, data.length);
    var hash = this._binaryToHex(this._hasher.finish(false));

    return hash;
  },

  /**
   * @returns The hash value as a hex-encoded string
   * From nsUpdateService.js.in.
   **/
  _binaryToHex: function fbc__binaryToHex(input) {
    var result = "";
    for (var i = 0; i < input.length; ++i) {
      var hex = input.charCodeAt(i).toString(16);
      if (hex.length == 1)
        hex = "0" + hex;
      result += hex;
    }
    return result;
  },

  _log: function fbc__log(message) {
    CoopGlobal.log("fbc: " + message);
  }
};
