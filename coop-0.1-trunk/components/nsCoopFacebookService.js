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

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const COOP_DATABASE_FILENAME = "coop.sqlite";

// Uniquely identifies the Facebook service from other services supported by
// the Coop.
const FACEBOOK_SERVICE_ID = "5f2cc903-521e-448a-a02d-0f033df25af5";

const FACEBOOK_API_KEY = "e75c259f51e2c8c390350a91055b416b";
const FACEBOOK_SECRET = "538730eb4cdf92ef4e38b11a88b028e1";

const FACEBOOK_GET_LINKS_PAGE = "http://www.facebook.com/shared.php";
const FACEBOOK_GET_LINKS_STYLESHEET = "chrome://coop/content/facebook-get-links.xsl";

const PREF_BRANCH = "extensions.coop.facebook";
const SESSION_KEY_PREF = PREF_BRANCH + ".sessionKey";
const SESSION_SECRET_PREF = PREF_BRANCH + ".sessionSecret";
const UID_PREF = PREF_BRANCH + ".uid";

const FACEBOOK_SESSION_INACTIVE = 0;
const FACEBOOK_SESSION_ACTIVE = 1;
const FACEBOOK_SESSION_ACTIVATING = 2;

function CoopFacebookService() {}

CoopFacebookService.prototype = {

//****************************************************************************//
// Convenience Getters

  // Observer Service
  __obs: null,
  get _obs() {
    if (!this.__obs)
      this.__obs = Cc["@mozilla.org/observer-service;1"].
                   getService(Ci.nsIObserverService);
    return this.__obs;
  },

  // IO Service
  __ios: null,
  get _ios() {
    if (!this.__ios)
      this.__ios = Cc["@mozilla.org/network/io-service;1"].
                   getService(Ci.nsIIOService);
    return this.__ios;
  },

  /**
   * Make a URI from a spec.
   * @param   spec
   *          The string spec of the URI.
   * @returns An nsIURI object.
   */
  _getURI: function fbs__uri(spec) {
    return this._ios.newURI(spec, null, null);
  },


//****************************************************************************//
// Interface Implementations

  // nsISupports

  // Interfaces this component implements.
  _interfaces: [Ci.nsICoopFacebookService,
                Ci.nsIObserver,
                Ci.nsISupportsWeakReference,
                Ci.nsISupports],

  QueryInterface: function fbs_QueryInterface(iid) {
    if (!this._interfaces.some( function(v) { return iid.equals(v) } ))
      throw Cr.NS_ERROR_NO_INTERFACE;
    return this;
  },

  // nsIObserver

  observe: function fbs_observe(subject, topic, data) {
    switch (topic) {
      case "xpcom-shutdown":
        this._destroy();
        break;
    }
  },


//****************************************************************************//
// Initialization and Destruction

  _init: function fbs_init() {
    // Observe shutdown so we can destroy ourselves then to avoid the appearance
    // of memory leaks.
    this._obs.addObserver(this, "xpcom-shutdown", true);

    this._initDatabase();

    if (this._client.sessionKey && this._client.sessionSecret && this._client.uid) {
      this._log("init: session is active");
      // Don't set this using the setter, as that will trigger a notification,
      // which might cause consumers to try to initialize this component again
      // before this initialization process has completed.
      this._sessionState = FACEBOOK_SESSION_ACTIVE;
    }
    else {
      this._log("init: session is not active");
      // Don't set this using the setter, as that will trigger a notification,
      // which might cause consumers to try to initialize this component again
      // before this initialization process has completed.
      this._sessionState = FACEBOOK_SESSION_INACTIVE;
    }

    // Load the XSLT stylesheet we'll use to extract information about links
    // from the Facebook Shares page.
    this.loadLinksStylesheet();
  },

  destroy: function fbs_destroy() {
    this._obs.removeObserver(this, "xpcom-shutdown");
  },


//****************************************************************************//
// Authentication & Session Management

  __client: null,
  get _client() {
    if (!this.__client) {
      // Retrieve an old session key and secret, if available.
      var sessionKey = CoopGlobal.getPref(SESSION_KEY_PREF, null);
      var sessionSecret = CoopGlobal.getPref(SESSION_SECRET_PREF, null);
      var uid = CoopGlobal.getPref(UID_PREF, null);

      this._log("get _client: sessionKey: " + sessionKey + "; sessionSecret: " + sessionSecret + "; uid: " + uid);

      this.__client = new FacebookClient();
      this.__client.init(FACEBOOK_API_KEY,
                         FACEBOOK_SECRET,
                         sessionKey,
                         sessionSecret,
                         uid,
                         true, // asynchronous method calls
                         this, // default load handler
                         this); // default error handler
    }

    return this.__client;
  },

  _sessionState: FACEBOOK_SESSION_INACTIVE,

  get sessionState() {
    return this._sessionState;
  },

  set sessionState(newValue) {
    if (newValue == this._sessionState)
      return;
    
    switch(newValue) {
      case FACEBOOK_SESSION_INACTIVE:
        this._sessionState = newValue;
        this._obs.notifyObservers(null, "coop-facebook-session-ended", null);
        break;
      case FACEBOOK_SESSION_ACTIVE:
        this._sessionState = newValue;
        this._obs.notifyObservers(null, "coop-facebook-session-started", null);
        break;
      case FACEBOOK_SESSION_ACTIVATING:
        this._sessionState = newValue;
        this._obs.notifyObservers(null, "coop-facebook-session-starting", null);
        break;
      default:
        throw "invalid session state: " + newValue;
    }
  },

  startSession: function fbs_startSession() {
    this.sessionState = FACEBOOK_SESSION_ACTIVATING;

    // Starting a session is a multi-stage asynchronous process, including
    // a stage where we wait for the user to authenticate, so here we just
    // kick off the process by initiating the first stage: creating
    // an authentication token.
    this._createAuthToken();
  },

  endSession: function fbs_endSession() {
    // XXX This doesn't log the user out of the Facebook web site. Should it,
    // or should the session state for the extension differ from that for
    // the site itself?  It looks like Facebook couples the two on session
    // start, since the user login process logs the user in to both the site
    // and the application.  And that's important for retrieving shares,
    // for which there isn't yet an API call.  But hopefully there will be one
    // in the future, at which point that won't be a blocker to decoupling
    // these two sessions if it makes sense to do so.  But it probably doesn't,
    // since the user will want to visit pages on the site that are made
    // accessible through the application, and if they're logged into the app,
    // then why should they have to log into the site as well?

    try { CoopGlobal.prefs.clearUserPref(SESSION_KEY_PREF) } catch(ex) {}
    try { CoopGlobal.prefs.clearUserPref(SESSION_SECRET_PREF) } catch(ex) {}
    try { CoopGlobal.prefs.clearUserPref(UID_PREF) } catch(ex) {}

    this._client.sessionKey = null;
    this._client.sessionSecret = null;
    this._client.uid = null;

    this.sessionState = FACEBOOK_SESSION_INACTIVE;
  },

  _createAuthToken: function fbs__createAuthToken() {
    var t = this;
    var loadHandler = function(event) { t._onCreateAuthToken(event) };
    var errorHandler = function(event) { t._onCreateAuthTokenError(event) };
    this._client.postRequest("facebook.auth.createToken", {},
                             true, loadHandler, errorHandler);
  },

  _onCreateAuthToken: function fbs__onCreateAuthToken(event) {
    if (event.target.responseText.indexOf('{"error_code":') == 0)
      this.handleAuthError(event.target.responseText);

    this._log("onCreateAuthToken: " + event.target.responseText);

    var authToken = this._client.parseJSON(event.target.responseText);

    // Construct the Facebook login URI and stuff it into a param block,
    // which is what nsIWindowWatcher::openWindow needs to pass the param
    // to the dialog.
    var loginURI = "http://www.facebook.com/login.php" +
                   "?api_key=" + FACEBOOK_API_KEY +
                   "&v=1.0" +
                   "&auth_token=" + authToken +
                   "&popup";
    const params = Cc["@mozilla.org/embedcomp/dialogparam;1"].
                   createInstance(Ci.nsIDialogParamBlock);
    params.SetNumberStrings(1);
    params.SetString(0, loginURI);

    // Open the authentication dialog and wait for the user to log in.
    // XXX Currently this is a modal to make it easy to implement, but that's
    // not the best user experience.  We should make it non-modal instead
    // and have the dialog call back to this service when the user closes it.
    var windowWatcher = Cc["@mozilla.org/embedcomp/window-watcher;1"].
                        getService(Ci.nsIWindowWatcher);
    windowWatcher.openWindow(null,
                             "chrome://coop/content/authBrowser.xul",
                             "_blank",
                             "chrome,modal,all,alwaysRaised,dialog=no centerscreen",
                             params);

    // At this point the user should be logged in, so use the authentication
    // token to retrieve a session key and secret.
    // XXX Do something different if the user clicked "Cancel" in the dialog.
    this._getSession(authToken);
  },

  _onCreateAuthTokenError: function fbs__onCreateAuthTokenError(event) {
      this.handleAuthError();
  },

  _getSession: function fbs__getSession(authToken) {
    var t = this;
    var loadHandler = function(event) { t._onGetSession(event) };
    var errorHandler = function(event) { t._onGetSessionError(event) };
    this._client.postRequest("facebook.auth.getSession",
                             { auth_token: authToken },
                             true,
                             loadHandler,
                             errorHandler);
  },

  _onGetSession: function fbs__onGetSession(event) {
    if (event.target.responseText.indexOf('{"error_code":') == 0)
      this.handleAuthError(event.target.responseText);

    // Sample response JSON:
    // {"session_key":"e8eb4c993a82c1801482361e-512848336",
    //  "uid":"512848336",
    //  "secret":"aea69f68a72fbe822f87a89d751abcc8"}

    var session = this._client.parseJSON(event.target.responseText);

    // Tell the client about the session information so it can send it
    // along with requests.
    this._client.sessionKey = session.session_key;
    this._client.sessionSecret = session.secret;
    this._client.uid = session.uid;

    // Persist the session identifiers so we can reuse them if the user
    // restarts their browser before Facebook times out the session.
    CoopGlobal.prefs.setCharPref(SESSION_KEY_PREF, session.session_key);
    CoopGlobal.prefs.setCharPref(SESSION_SECRET_PREF, session.secret);
    CoopGlobal.prefs.setCharPref(UID_PREF, session.uid);

    this.sessionState = FACEBOOK_SESSION_ACTIVE;
  },

  _onGetSessionError: function fbs__onGetSessionError(event) {
    this.handleAuthError();
  },

  /**
   * Handle an error that occurs when we're in the process of authenticating.
   * The main difference between this method and handleError is that handleError
   * only deactivates the session on "Session key invalid or no longer valid",
   * while this method deactivates the session on any error.
   **/
  handleAuthError: function fbs_handleAuthError(responseText) {
    // Sample JSON response:
    // {"error_code":102,
    //  "error_msg":"Session key invalid or no longer valid",
    //  "request_args":[{"key":"method","value":"facebook.friends.get"},
    //                  {"key":"session_key","value":"371b4e5b53f0ed5ab4f17c9b-512848336u"},
    //                  {"key":"api_key","value":"e75c259f51e2c8c390350a91055b416b"},
    //                  {"key":"v","value":"1.0"},
    //                  {"key":"call_id","value":"1173820994185"},
    //                  {"key":"format","value":"json"},
    //                  {"key":"sig","value":"a5b6e0db3081a6bec831bbfac5be6157"}]}

    // Errors I've seen so far:

    // 100: Invalid parameter
    // XXX We get this when we call getSession after the user fails to log in.
    // I'm still not sure why, but really we should just not call getSession
    // if the user failed to log in.
      
    // 102: Session key invalid or no longer valid

    this.sessionState = FACEBOOK_SESSION_INACTIVE;
    this._obs.notifyObservers(null, "coop-facebook-auth-failed", null);

    if (responseText) {
      var error = this._client.parseJSON(responseText);
      throw("error " + error.error_code + ": " + error.error_msg);
    }
    else
      throw("Facebook authentication error; deactivated session");
  },

  /**
   * Handle an error response.
   **/
  handleError: function fbs_handleError(responseText) {
    var error = this._client.parseJSON(responseText);

    switch(error.error_code) {
      case 102: // Session key invalid or no longer valid
        this.sessionState = FACEBOOK_SESSION_INACTIVE;
        break;
    }

    throw("error " + error.error_code + ": " + error.error_msg);
  },


//****************************************************************************//
// Database Access

  // XXX Implement an OO API on top of this relational API.

  __getFriendsStatement: null,
  get _getFriendsStatement() {
    if (!this.__getFriendsStatement)
      this.__getFriendsStatement =
        // This query orders people by most recent unseen link.  First we sort
        // by unseen link (using COALESCE to turn "null" values into "3"
        // so people without any links show up last rather than first),
        // then we sort by timestamp descending (i.e. most to least recent).
        this._createStatement("SELECT DISTINCT people.id, name, pic \
                               FROM friends \
                               JOIN people ON friends.friendID = people.id \
                               LEFT JOIN links ON people.id = links.senderID \
                               WHERE friends.selfID = :selfID \
                               ORDER BY COALESCE(links.seen, 3), links.timestamp DESC");
    return this.__getFriendsStatement;
  },

  getFriends: function fbs_getFriends(selfID) {
    var statement = this._getFriendsStatement;
    var people = [];

    statement.params.selfID = selfID || this.currentUser.id;

    try {
      while (statement.step())
        people.push({ id: statement.row["id"],
                      name: statement.row["name"],
                      pic: statement.row["pic"]});
    }
    finally {
      statement.reset();
    }

    // XXX Hack so we can pass this structure back to the sidebar without having
    // to define an interface for it.  We'll have to define an interface eventually,
    // of course.
    people.wrappedJSObject = people;

    return people;
  },

  __getLinksStatement: null,
  get _getLinksStatement() {
    if (!this.__getLinksStatement)
      this.__getLinksStatement =
        this._createStatement("SELECT id, serviceID, remoteID, senderID, \
                                      recipientID, uri, timestamp, title, \
                                      summary, comment, modifiedURI, \
                                      thumbnailURI, seen \
                               FROM   links \
                               WHERE  senderID = :senderID \
                               AND    recipientID = :recipientID \
                               ORDER BY timestamp DESC");
    return this.__getLinksStatement;
  },

  getLinks: function fbs_getLinks(senderID, recipientID) {
    var statement = this._getLinksStatement;
    var links = [];

    statement.params.senderID = senderID;
    statement.params.recipientID = recipientID || this.currentUser.id;

    var keys = ["id", "serviceID", "remoteID", "senderID", "recipientID", "uri",
                "timestamp", "title", "summary", "comment", "modifiedURI",
                "thumbnailURI", "seen"];
    try {
      while (statement.step()) {
        var link = {};
        for each (var key in keys)
          link[key] = statement.row[key];
        links.push(link);
      }
    }
    finally {
      statement.reset();
    }

    // XXX Hack so we can pass this structure back to the sidebar without having
    // to define an interface for it.  We'll have to define an interface eventually,
    // of course.
    var linksWrapper = { links: links };
    linksWrapper.wrappedJSObject = linksWrapper;

    return linksWrapper;
  },

  __getAllLinksStatement: null,
  get _getAllLinksStatement() {
    if (!this.__getAllLinksStatement)
      this.__getAllLinksStatement =
        this._createStatement("SELECT id, serviceID, remoteID, senderID, \
                                      recipientID, uri, timestamp, title, \
                                      summary, comment, modifiedURI, \
                                      thumbnailURI, seen \
                               FROM   links \
                               WHERE  recipientID = :recipientID \
                               ORDER BY timestamp DESC");
    return this.__getAllLinksStatement;
  },

  getAllLinks: function fbs_getAllLinks(recipientID) {
    var statement = this._getAllLinksStatement;
    var links = [];

    statement.params.recipientID = recipientID || this.currentUser.id;

    var keys = ["id", "serviceID", "remoteID", "senderID", "recipientID", "uri",
                "timestamp", "title", "summary", "comment", "modifiedURI",
                "thumbnailURI", "seen"];
    try {
      while (statement.step()) {
        var link = {};
        for each (var key in keys)
          link[key] = statement.row[key];
        links.push(link);
      }
    }
    finally {
      statement.reset();
    }

    // XXX Hack so we can pass this structure back to the sidebar without having
    // to define an interface for it.  We'll have to define an interface eventually,
    // of course.
    var linksWrapper = { links: links };
    linksWrapper.wrappedJSObject = linksWrapper;

    return linksWrapper;
  },

  __getPersonStatement: null,
  get _getPersonStatement() {
    if (!this.__getPersonStatement)
      this.__getPersonStatement =
        this._createStatement("SELECT name, pic from people \
                               WHERE id = :personID");
    return this.__getPersonStatement;
  },

  getPerson: function fbs_getPerson(personID) {
    var statement = this._getPersonStatement;
    var person = null;

    statement.params.personID = personID;

    try {
      if (statement.step())
        person = { id: personID,
                   name: statement.row["name"],
                   pic: statement.row["pic"]};
    }
    finally {
      statement.reset();
    }

    person.wrappedJSObject = person;
    return person;
  },

  __getAccountStatement: null,
  get _getAccountStatement() {
    if (!this.__getAccountStatement)
      this.__getAccountStatement =
        this._createStatement("SELECT id, personID FROM accounts \
                               WHERE serviceID = :serviceID \
                               AND remoteID = :remoteID");
    return this.__getAccountStatement;
  },

  getAccount: function fbs_getAccount(serviceID, remoteID) {
    var account = null;

    var statement = this._getAccountStatement;
    statement.params.serviceID = serviceID;
    statement.params.remoteID = remoteID;
    try {
      if (statement.step())
        account = { id: statement.row["id"],
                    serviceID: serviceID,
                    remoteID: remoteID,
                    personID: statement.row["personID"] };
    }
    finally {
      statement.reset();
    }

    return account;
  },

  __getAccountForPersonStatement: null,
  get _getAccountForPersonStatement() {
    if (!this.__getAccountForPersonStatement)
      this.__getAccountForPersonStatement =
        this._createStatement("SELECT id, remoteID FROM accounts \
                               WHERE personID = :personID \
                               AND serviceID = :serviceID");
    return this.__getAccountForPersonStatement;
  },

  getAccountForPerson: function fbs_getAccountForPerson(personID, serviceID) {
    var account = null;

    var statement = this._getAccountForPersonStatement;
    statement.params.personID = personID;
    statement.params.serviceID = serviceID || FACEBOOK_SERVICE_ID;
    try {
      if (statement.step())
        account = { id: statement.row["id"],
                    personID: personID,
                    serviceID: serviceID,
                    remoteID: statement.row["remoteID"] };
    }
    finally {
      statement.reset();
    }

    if (account)
      account.wrappedJSObject = account;
    return account;
  },

  __addPersonStatement: null,
  get _addPersonStatement() {
    if (!this.__addPersonStatement)
      this.__addPersonStatement =
        this._createStatement("INSERT INTO people (name, pic) \
                               VALUES (:name, :pic)");
    return this.__addPersonStatement;
  },

  addPerson: function fbs_addPerson(name, pic) {
    this._log("addPerson: name=" + name + "; pic=" + pic);

    var statement = this._addPersonStatement;
    statement.params.name = name;
    statement.params.pic = pic;
    statement.execute();

    return { id: this.database.lastInsertRowID, name: name, pic: pic };
  },

  __addAccountStatement: null,
  get _addAccountStatement() {
    if (!this.__addAccountStatement)
      this.__addAccountStatement =
        this._createStatement("INSERT INTO accounts (serviceID, remoteID, personID) \
                               VALUES (:serviceID, :remoteID, :personID)");
    return this.__addAccountStatement;
  },

  addAccount: function fbs_addAccount(serviceID, remoteID, personID) {
    var statement = this._addAccountStatement;
    statement.params.serviceID = serviceID;
    statement.params.remoteID = remoteID;
    statement.params.personID = personID;
    statement.execute();

    return { id: this.database.lastInsertRowID,
             serviceID: serviceID,
             remoteID: remoteID,
             personID: personID };
  },

  get currentUser() {
    if (!this._client.uid) {
      this._log("get currentUser: not available");
      return null;
    }

    var account = this.getAccount(FACEBOOK_SERVICE_ID, this._client.uid);
    var person;
    if (!account) {
      // XXX Spawn a process to retrieve the user's real name and pic
      // and update the database with this information.
      // XXX Better yet, ensure that the user is in the database by always
      // checking when we init the connector.
      person = this.addPerson("", null);
      account = this.addAccount(FACEBOOK_SERVICE_ID, this._client.uid, person.id);
    }
    else
      person = this.getPerson(account.personID);

    return person;
  },

  __isFriendStatement: null,
  get _isFriendStatement() {
    if (!this.__isFriendStatement)
      this.__isFriendStatement =
        this._createStatement("SELECT 1 FROM friends \
                               WHERE selfID = :selfID \
                               AND friendID = :friendID");
    return this.__isFriendStatement;
  },

  isFriend: function fbs_isFriend(person) {
    var isFriend;

    var statement = this._isFriendStatement;
    statement.reset();
    statement.params.selfID = this.currentUser.id;
    statement.params.friendID = person.id;
    try {
      isFriend = statement.step() ? true : false;
    }
    finally {
      statement.reset();
    }

    return isFriend;
  },

  __makeFriendStatement: null,
  get _makeFriendStatement() {
    if (!this.__makeFriendStatement)
      this.__makeFriendStatement =
        this._createStatement("INSERT INTO friends (selfID, friendID) \
                               VALUES (:selfID, :friendID)");
    return this.__makeFriendStatement;
  },

  makeFriend: function fbs_makeFriend(person) {
    var statement = this._makeFriendStatement;
    statement.params.selfID = this.currentUser.id;
    statement.params.friendID = person.id;
    statement.execute();
  },

  __addLinkStatement: null,
  get _addLinkStatement() {
    if (!this.__addLinkStatement)
      this.__addLinkStatement =
        this._createStatement("INSERT \
                               INTO links (serviceID, remoteID, senderID, \
                                           recipientID, uri, timestamp, title, \
                                           summary, comment, modifiedURI, \
                                           thumbnailURI, seen) \
                                   VALUES (:serviceID, :remoteID, :senderID, \
                                           :recipientID, :uri, :timestamp, :title, \
                                           :summary, :comment, :modifiedURI, \
                                           :thumbnailURI, 0)");
    return this.__addLinkStatement;
  },

  _linkKeys: ["remoteID", "senderID", "uri", "timestamp", "title", "summary",
              "comment", "modifiedURI", "thumbnailURI"],

  addLink: function fbs_addLink(link) {
    var statement = this._addLinkStatement;
    for each (var key in this._linkKeys)
      statement.params[key] = link[key];
    statement.params.serviceID = FACEBOOK_SERVICE_ID;
    statement.params.recipientID = this.currentUser.id;
    statement.execute();
  },

  __removeLinkStatement: null,
  get _removeLinkStatement() {
    if (!this.__removeLinkStatement)
      this.__removeLinkStatement =
        this._createStatement("DELETE FROM links \
                               WHERE serviceID = :serviceID \
                               AND recipientID = :recipientID \
                               AND remoteID = :remoteID");
    return this.__removeLinkStatement;
  },

  removeLink: function fbs_removeLink(link) {
    var statement = this._removeLinkStatement;
    statement.params.serviceID = FACEBOOK_SERVICE_ID;
    statement.params.recipientID = this.currentUser.id;
    statement.params.remoteID = link.remoteID;
    statement.execute();
  },


//****************************************************************************//
// Link Management

  // The Facebook API doesn't yet have a mechanism for retrieving a user's
  // links, so we retrieve them by downloading the HTML page displaying
  // the links and parsing it to extract its data via an XSLT stylesheet.

  _linksStylesheet: null,

  loadLinksStylesheet: function fbs_loadLinksStylesheet() {
    var stylesheetURI = this._getURI(FACEBOOK_GET_LINKS_STYLESHEET);

    var t = this;
    var loadHandler =
      function(resource) {
        try     { t.onLoadLinksStylesheet(resource) }
        finally { resource.destroy() }
      };
    var errorHandler =
      function(resource) {
        try     { t.onLoadLinksStylesheetError(resource) }
        finally { resource.destroy() }
      };

    var resource = new MicrosummaryResource(stylesheetURI);
    resource.load(loadHandler, errorHandler);
  },

  onLoadLinksStylesheet: function onLoadLinksStylesheet(resource) {
    this._log("loaded links stylesheet: " + resource.content);
    this._linksStylesheet = resource.content;
    this.updateLinks();
  },

  onLoadLinksStylesheetError: function onLoadLinksStylesheetError(resource) {
    this._log("error loading links stylesheet; won't be able to update links");
  },

  __hasLinkStatement: null,
  get _hasLinkStatement() {
    if (!this.__hasLinkStatement)
      this.__hasLinkStatement =
        this._createStatement("SELECT 1 FROM links \
                               WHERE serviceID = :serviceID \
                               AND remoteID = :remoteID");
    return this.__hasLinkStatement;
  },

  hasLink: function fbs_hasLink(link) {
    var hasLink;

    var statement = this._hasLinkStatement;
    statement.reset();
    statement.params.serviceID = FACEBOOK_SERVICE_ID;
    statement.params.remoteID = link.remoteID;
    try {
      hasLink = statement.step() ? true : false;
    }
    finally {
      statement.reset();
    }

    return hasLink;
  },

//****************************************************************************//
// Friend & Link Synchronization

  updateFriends: function fbs_updateFriends() {
    if (this._sessionState != FACEBOOK_SESSION_ACTIVE)
      return;

    this._log("updateFriends: beginning update");

    var t = this;
    var loadHandler = function(event) { t.onUpdateFriends(event) };
    var errorHandler = function(event) { t.onUpdateFriendsError(event) };
    this._client.postRequest("facebook.fql.query",
                             { query: "SELECT uid, name, pic FROM user WHERE uid IN (SELECT uid2 FROM friend WHERE uid1 = " + this._client.uid + ")" },
                             true, loadHandler, errorHandler);
  },

  onUpdateFriends: function fbs_onUpdateFriends(event) {
    if (event.target.responseText.indexOf('{"error_code":') == 0)
      this.handleError(event.target.responseText);

    this._log("onUpdateFriends");

    var somethingChanged = false;

    // XXX In addition to adding new friends, we should be removing old ones
    // that the user is no longer friends with.
    // Sample JSON response:
    //[{"name":"Foo Bar","pic":"http:\/\/profile.ak.facebook.com\/blah/blah/blah.jpg","uid":5551212},...]
    var friends = this._client.parseJSON(event.target.responseText);
    //this._log("onUpdateFriends: " + uneval(friends));
    for each (var friend in friends) {
      var account = this.getAccount(FACEBOOK_SERVICE_ID, friend.uid);
      var person;
      if (!account) {
        // At the moment we assume that there's no person if there's no account,
        // but in the future that won't always be true, since this may well be
        // a new account for an existing person.  Whether or not we'll be able
        // to automatically detect that the new account belongs to an existing
        // person is another matter, of course.  We'll probably have to rely
        // on some mechanism for the user to manually indicate after the fact
        // that two people are really one and the same, at least initially.
        person = this.addPerson(friend.name, friend.pic);
        account = this.addAccount(FACEBOOK_SERVICE_ID, friend.uid, person.id);
      }
      else
        person = this.getPerson(account.personID);
      if (!this.isFriend(person)) {
        this.makeFriend(person);
        somethingChanged = true;
      }
    }
    
    // Perhaps we should notify specifically for those friends that have been
    // added or removed.
    if (somethingChanged)
      this._obs.notifyObservers(null, "coop-facebook-friends-updated", null);
  },

  onUpdateFriendsError: function fbs_onUpdateFriendsError(event) {
    this._log("onUpdateFriendsError");
  },

  updateLinks: function fbs_updateLinks() {
    if (this._sessionState != FACEBOOK_SESSION_ACTIVE)
      return;

    if (!this._linksStylesheet) {
      this._log("can't get links; no stylesheet");
      return;
    }

    var linksPage = this._getURI(FACEBOOK_GET_LINKS_PAGE);

    var t = this;
    var loadHandler =
      function(resource) {
        try     { t.onUpdateLinks(resource) }
        finally { resource.destroy() }
      };
    var errorHandler =
      function(resource) {
        try     { t.onUpdateLinksError(resource) }
        finally { resource.destroy() }
      };

    // XXX Maybe this should be an XPCOM component, although rsayre's DOMParser
    // will be here soon enough, after which we can just use that instead.
    var resource = new MicrosummaryResource(linksPage);
    resource.load(loadHandler, errorHandler);
  },

  __markLinksSeenStatement: null,
  get _markLinksSeenStatement() {
    if (!this.__markLinksSeenStatement)
      this.__markLinksSeenStatement =
        this._createStatement("UPDATE links SET seen = 1 \
                               WHERE senderID = :senderID \
                               AND recipientID = :recipientID");
    return this.__markLinksSeenStatement;
  },

  markLinksSeen: function fbs_markLinksSeen(senderID, recipientID) {
    var statement = this._markLinksSeenStatement;
    statement.params.senderID = senderID;
    statement.params.recipientID = recipientID || this.currentUser.id;
    statement.execute();
  },

  onUpdateLinks: function fbs_onUpdateLinks(linksDoc) {
    var linkAdded = false;

    if (linksDoc.content.getElementById("loginform")) {
      this._log("onUpdateLinks: session has expired; deactivating it");
      this.sessionState = FACEBOOK_SESSION_INACTIVE;
      return;
    }

    // XXX Should we just have one global instance of the processor?
    var processor = Cc["@mozilla.org/document-transformer;1?type=xslt"].
                    createInstance(Ci.nsIXSLTProcessor);

    processor.importStylesheet(this._linksStylesheet);
    var fragment = processor.transformToFragment(linksDoc.content, linksDoc.content);
    
    //this._log("processed links with result: " + fragment);
    //this._log("top-level element: " + fragment.firstChild);

/*
    this._log("onUpdateLinks: about to get all local links");
    var localLinks = this.getAllLinks().links;
    this._log("onUpdateLinks: just got local links");
    var localLinkRemoteIDs = {};
    for each (var localLink in localLinks)
      localLinkRemoteIDs[localLink.remoteID] = true;
*/

    var links = fragment.firstChild;
    for (var i = 0; i < links.childNodes.length; i++) {
      var link = {};
      for each (var key in this._linkKeys)
        link[key] = links.childNodes[i].getElementsByTagName(key)[0].textContent;

      // Convert the timestamp to the ISO 8601 standard date format.
      link.timestamp = this.convertTimestampToISO8601(link.timestamp);

      // Convert the sender ID from the remote ID to the local ID.
      var account = this.getAccount(FACEBOOK_SERVICE_ID, link.senderID);
      // If there's no account, we've just retrieved a link from someone
      // who isn't (yet?) a friend, and we don't know what to do with that.
      if (!account)
        continue;
      link.senderID = account.personID;

      if (!this.hasLink(link)) {
        this._log("adding link " + link.remoteID + " to local store");
        this.addLink(link);
        linkAdded = true;
      }
/*
      else if (localLinkRemoteIDs[link.remoteID])
        delete localLinkRemoteIDs[link.remoteID];
*/
    }
/*
    for (var remoteID in localLinkRemoteIDs) {
      this._log("deleting link " + link.remoteID + " from local store");
      this.removeLink(link);
    }
*/

    if (linkAdded)
      this._obs.notifyObservers(null, "coop-facebook-links-updated", null);
  },

  onUpdateLinksError: function fbs_onUpdateLinksError() {
    this._log("onUpdateLinksError");
  },


//****************************************************************************//
// Utilities

  /**
   * Convert a Facebook "shares" page timestamp to an ISO 8601 standard
   * (http://www.w3.org/TR/NOTE-datetime) date string in the UTC timezone.
   * This function makes two assumptions about the timestamp:
   *   1. it's in the format "h:mm(am|pm) mon day"
   *   2. it represents a time in the user's local timezone
   *   3. the year isn't specified, but it's the current year
   * Of these three assumptions, the last in particular is likely to be false
   * in some cases, and the veracity of the second assumption is also unclear.
   **/
  convertTimestampToISO8601: function(timestamp) {
    // example timestamp: 7:24pm Mar 13
    var [time, month, day] = timestamp.split(" ");
    // time: 7:24pm, month: Mar, day: 13
    var [hour, minute] = time.split(":");
    // hour: 7, minute: 24pm
    if (minute.substr(-2) == "am")
      minute = minute.slice(0, -2)
      // minute: 24 (or would, if the example timestamp was in the "am")
    else if (minute.substr(-2) == "pm") {
      minute = minute.slice(0, -2);
      hour = parseInt(hour) + 12;
      // minute: 24, hour: 19
    }
    var IETFDate = month + " " + day + ", " + new Date().getFullYear() +
                         " " + hour + ":" + minute;
    // IETFDate: Mar 13, 2007 19:24
    var date = new Date(IETFDate);
    // date: JavaScript date object whose string equivalent (assuming
    // the local timezone is PDT) is: Tue Mar 13, 2007 19:24:00 GMT-0700 (PDT)
    var pad = function(num) { return num.toString().length == 1 ? "0" + num : num };
    var ISO8601Date = date.getUTCFullYear() + "-" +
                      pad(date.getUTCMonth() + 1) + "-" +
                      pad(date.getUTCDate()) + "T" +
                      pad(date.getUTCHours()) + ":" +
                      pad(date.getUTCMinutes()) + ":" +
                      pad(date.getUTCSeconds());
    // ISO8601Date: 2007-03-14T02:24:00
    return ISO8601Date;
  },


//****************************************************************************//
// Database Creation

  schema: {
    // We're not yet tracking services because there's nothing to store.
    // Their IDs get assigned by the component that implements the connector.
    //services: [],

    // We're not yet tracking users because there's nothing to store,
    // and their IDs get assigned by the people table.
    //users: [],

    // People who use the services supported by the Coop.
    // People are the primary "thing" (object, monad) this model tracks.
    // Users and their friends both have entries in this table.
    people:     ["id            INTEGER PRIMARY KEY",
                 "name          TEXT NOT NULL",
                 // A Base64-encoded data: URI (f.e. data:image/png;base64,...).
                 "pic           TEXT"],

    // The relationships between users and their friends.
    // Both columns in this table reference IDs of people in the people table.
    //
    // XXX If you have a friend, does that mean that your friend has you
    // as a friend?  If so, then either there's no difference between "self"
    // and "friend", and we shouldn't name the columns as if there was, or we
    // should insert two records into this table for each such relationship.
    //
    // Bidirectionality is probably fundamental to the concept of "friendship"
    // as used by social services, but other concepts we might map with this
    // table (with an expanded "relationship type" column, of course), like
    // trust, won't necessarily be bidirectional, so there is some value
    // in retaining the unidirectional nature of this table.
    friends:    ["selfID        INTEGER NOT NULL REFERENCES people(id)",
                 "friendID      INTEGER NOT NULL REFERENCES people(id)",
                 // Should this be merely a UNIQUE constraint?
                 "PRIMARY KEY   (selfID, friendID)"],

    // Accounts that people have with services.  Each record in the people table
    // should be accompanied by one or more records in this table.  The remoteID
    // column stores the ID assigned to the account by the service.
    accounts:   ["id            INTEGER PRIMARY KEY",
                 "remoteID      TEXT NOT NULL",
                 "serviceID     TEXT NOT NULL",
                 "personID      INTEGER NOT NULL REFERENCES people(id)",
                 // This consraint prevents multiple records being created
                 // for the same account with a particular service.
                 "UNIQUE        (remoteID, serviceID)"],

    // Links that friends have sent to users of the Coop.
    links:      ["id            INTEGER PRIMARY KEY",
                 "remoteID      TEXT NOT NULL",
                 "serviceID     TEXT NOT NULL",
                 "senderID      INTEGER REFERENCES people(id)",
                 "recipientID   INTEGER REFERENCES people(id)",
                 "uri           TEXT NOT NULL",
                 "timestamp     TEXT",
                 "title         TEXT",
                 // XXX Might this be HTML or some other rich text/image format?
                 "summary       TEXT",
                 // The comment the sender wrote about the link (if any).
                 "comment       TEXT",
                 // The modified URI is only present if different from the
                 // original URI.  It represents the link that the service
                 // presents to users, and presumably it is different in order
                 // for the service to be able to track which users click on
                 // which links.
                 "modifiedURI   TEXT",
                 // A link to a thumbnail image representing the link, if any.
                 "thumbnailURI  TEXT",
                 // Boolean value indicating whether or not the user has "seen"
                 // (by some definition of the word that is still to be
                 // determined) the link.  This value should always be either
                 // zero or one.
                 "seen          INTEGER"]
  },

  _createStatement: function(sqlString) {
    var statement = this.database.createStatement(sqlString);
    var wrappedStatement = Cc["@mozilla.org/storage/statement-wrapper;1"].
                           createInstance(Ci.mozIStorageStatementWrapper);
    wrappedStatement.initialize(statement);
    return wrappedStatement;
  },

  _dbService: null,
  get dbService() {
    if (!this._dbService)
      this._dbService = Cc["@mozilla.org/storage/service;1"].
                        getService(Ci.mozIStorageService);
    return this._dbService;
  },

  _initDatabase: function() {
    var dirService = Cc["@mozilla.org/file/directory_service;1"].
                     getService(Ci.nsIProperties);
    var file = dirService.get("ProfD", Ci.nsIFile);
    file.append(COOP_DATABASE_FILENAME);

    try {
      this.database = this.dbService.openDatabase(file);
    }
    catch (ex) {
      if (ex.result == Cr.NS_ERROR_FILE_CORRUPTED) {
        // I'm not sure whether we should just delete the corrupted file
        // or back it up.  For now I'm just deleting it.

        // Back up the corrupted file in case data can be recovered from it.
        // XXX Provide some mechanism for limiting the number of backup copies.
        //var backup = file.clone();
        //backup.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, PERMS_FILE);
        //backup.remove(false);
        //file.moveTo(null, backup.leafName);

        // Remove the corrupted file.
        file.remove(false);

        // Recreate the file.
        this.database = this.dbService.openDatabase(file);
      }
      else
        throw ex;
    }
  
    for (var table in this.schema) {
      try {
        this.database.createTable(table, this.schema[table].join(","));
      }
      catch (ex) {
        // createTable will fail if the table already exists, which is fine.
        // Unfortunately, the exception is NS_ERROR_FAILURE, which doesn't
        // allow us to distinguish between "table already exists" failures
        // we can ignore and other failures we shouldn't.
        // XXX Resolve this by checking for the existence of the table
        // before trying to create it.
      }
    }
  },

  _log: function fbs__log(message) {
    CoopGlobal.log("fbs: " + message);
  }
};

var gModule = {
  _components: {
    service: {
      CID        : Components.ID("{f2cd628e-0b0c-4d8b-aca0-32ecf5d19cf9}"),
      contractID : "@mozilla.org/coop/facebook/service;1",
      className  : "Coop Facebook Service",
      factory    : CoopFacebookServiceFactory = {
                     createInstance: function(aOuter, aIID) {
                       if (aOuter != null)
                         throw Cr.NS_ERROR_NO_AGGREGATION;
                       var component = new CoopFacebookService();
                       component._init();
                      return component.QueryInterface(aIID);
                     }
                   }
    }
  },
  
  // XXX These should probably be components, but then I'd have to define
  // interfaces for them, blah blah blah.  All in good time.
  _subscripts: ["chrome://coop/content/global.js",
                "chrome://coop/content/MicrosummaryResource.js",
                "chrome://coop/content/facebook-client.js"],

  _subscriptsLoaded: false,

  registerSelf: function(componentManager, fileSpec, location, type) {
    componentManager = componentManager.QueryInterface(Ci.nsIComponentRegistrar);
    
    for (var key in this._components) {
      var component = this._components[key];
      componentManager.registerFactoryLocation(component.CID,
                                               component.className,
                                               component.contractID,
                                               fileSpec,
                                               location,
                                               type);
    }
  },
  
  unregisterSelf: function(componentManager, fileSpec, location) {},

  getClassObject: function(componentManager, cid, iid) {
    if (!iid.equals(Components.interfaces.nsIFactory))
      throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  
    if (!this._subscriptsLoaded) {
      var subscriptLoader = Cc["@mozilla.org/moz/jssubscript-loader;1"].
                            getService(Ci.mozIJSSubScriptLoader);
      for each (var subscript in this._subscripts)
        subscriptLoader.loadSubScript(subscript);
    }

    for (var key in this._components)
      if (cid.equals(this._components[key].CID))
        return this._components[key].factory;

    throw Cr.NS_ERROR_NO_INTERFACE;
  },
  
  canUnload: function(componentManager) {
    return true;
  }
};

function NSGetModule(compMgr, fileSpec) {
  return gModule;
}
