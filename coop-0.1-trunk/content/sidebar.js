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

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const HTML_NS = "http://www.w3.org/1999/xhtml";
const MISSING_PIC_URL = "http://static.ak.facebook.com//pics/s_default.jpg";

var gMainWindow = window.QueryInterface(Ci.nsIInterfaceRequestor)
                        .getInterface(Ci.nsIWebNavigation)
                        .QueryInterface(Ci.nsIDocShellTreeItem)
                        .rootTreeItem
                        .QueryInterface(Ci.nsIInterfaceRequestor)
                        .getInterface(Ci.nsIDOMWindow);

var Coop = {

//****************************************************************************//
// Convenience Getters

  // Coop Facebook Service
  __fbs: null,
  get _fbs() {
    if (!this.__fbs)
      this.__fbs = Cc["@mozilla.org/coop/facebook/service;1"].
                   getService(Ci.nsICoopFacebookService);
    return this.__fbs;
  },

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


//****************************************************************************//
// Interface Implementations

  // nsISupports
  _interfaces: [Ci.nsIObserver,
                Ci.nsISupportsWeakReference,
                Ci.nsISupports],

  QueryInterface: function coop_QueryInterface(iid) {
    if (!this._interfaces.some( function(v) { return iid.equals(v) } ))
      throw Cr.NS_ERROR_NO_INTERFACE;
    return this;
  },

  // nsIObserver
  observe: function coop_observe(subject, topic, data) {
    this._log("observing " + topic);

    switch (topic) {
      case "coop-facebook-session-ended":
        this.updateView();
        break;
      case "coop-facebook-session-started":
        this.updateView();
        this.buildFriendsPane();
        this._fbs.updateFriends();
        this._fbs.updateLinks();
        break;
      case "coop-facebook-session-starting":
        this.updateView();
        break;
      case "coop-facebook-friends-updated":
      case "coop-facebook-links-updated":
        this.buildFriendsPane(subject);
        break;
    }
  },

//****************************************************************************//
// Initialization and Destruction

  init: function coop_init() {
    this._log("init");

    // Observe the various session and update events that trigger UI changes.
    // XXX Should we make the service register observers directly
    // so we only have to call addObserver once?
    this._obs.addObserver(this, "coop-facebook-session-ended", true);
    this._obs.addObserver(this, "coop-facebook-session-started", true);
    this._obs.addObserver(this, "coop-facebook-session-starting", true);
    this._obs.addObserver(this, "coop-facebook-friends-updated", true);
    this._obs.addObserver(this, "coop-facebook-links-updated", true);

    // Periodically sync the friends and links from Facebook to the datastore.
    // XXX Shouldn't the service be doing this?  It shouldn't be doing it unless
    // a sidebar is open, but we could have sidebars register themselves with
    // the service when they open and unregister themselves when they close.
    // Then the service could check to see if any sidebars are open and only
    // update if they are.
    var t = this;
    window.setInterval(function() { t._fbs.updateFriends() }, 60 * 60 * 1000); // hourly
    window.setInterval(function() { t._fbs.updateLinks() }, 1 * 60 * 1000); // minutely

    // Switches to the appropriate view (content, throbber, or login) depending
    // on whether the current session state is active, activating, or inactive.
    this.updateView();

    switch (this._fbs.sessionState) {
      case Ci.nsICoopFacebookService.FACEBOOK_SESSION_ACTIVE:
        this._log("init: session active; building friends pane");
        this.buildFriendsPane();
        this._fbs.updateFriends();
        this._fbs.updateLinks();
        break;
      case Ci.nsICoopFacebookService.FACEBOOK_SESSION_ACTIVATING:
        this._log("init: session activating; awaiting activation");
        // In the process of establishing a session.  Don't do anything.
        break;
      default:
        this._log("init: session not active; starting activation");
        this.startSession();
        break;
    }
  },

  destroy: function coop_destroy() {
    this._log("destroy");

    this._obs.removeObserver(this, "coop-facebook-session-ended");
    this._obs.removeObserver(this, "coop-facebook-session-started");
    this._obs.removeObserver(this, "coop-facebook-session-starting");
    this._obs.removeObserver(this, "coop-facebook-friends-updated");
    this._obs.removeObserver(this, "coop-facebook-links-updated");
  },


//****************************************************************************//
// Session Management

  startSession: function coop_startSession() {
    this._fbs.startSession();
  },

  endSession: function coop_endSession() {
    this._fbs.endSession();
  },


//****************************************************************************//
// View Management

  updateView: function coop_updateView() {
    var loginPane = document.getElementById("loginPane");
    var throbberPane = document.getElementById("throbberPane");
    var contentPane = document.getElementById("contentPane");

    switch (this._fbs.sessionState) {
      case Ci.nsICoopFacebookService.FACEBOOK_SESSION_ACTIVE:
        this._log("showing content pane");
        loginPane.hidden = true
        throbberPane.hidden = true
        contentPane.hidden = false;
        break;
      case Ci.nsICoopFacebookService.FACEBOOK_SESSION_ACTIVATING:
        this._log("showing throbber pane");
        loginPane.hidden = true
        throbberPane.hidden = false;
        contentPane.hidden = true
        break;
      default:
        this._log("showing login pane");
        loginPane.hidden = false;
        throbberPane.hidden = true
        contentPane.hidden = true
        break;
    }
  },

  showFriendPane: function() {
    document.getElementById("friendsPane").style.display = "none";
    document.getElementById("friendPane").hidden = false;
  },

  showFriendsPane: function() {
    this.buildFriendsPane();
    document.getElementById("friendsPane").style.display = "block";
    document.getElementById("friendPane").hidden = true;
  },

  showFriend: function coop_showFriend(personID) {
    var friend = this._fbs.getPerson(personID).wrappedJSObject;
    
    var links = this._fbs.getLinks(personID, null).wrappedJSObject.links;
    var unseenLinks = 0;
    for each (var link in links)
      if (link.seen == 0)
        ++unseenLinks;

    var friendPane = document.getElementById("friendPane");
    while (friendPane.hasChildNodes())
      friendPane.removeChild(friendPane.firstChild);

    var container = this.buildFriendWidget(friend, unseenLinks, true);
    container.addEventListener("dragover", function(event) { nsDragAndDrop.dragOver(event, Coop) }, false);
    container.addEventListener("dragexit", function(event) { nsDragAndDrop.dragExit(event, Coop) }, false);
    container.addEventListener("dragdrop", function(event) { nsDragAndDrop.drop(event, Coop) }, false);
    friendPane.appendChild(container);

    this.markLinksSeen(friend.id);

    var countsContainer = createXULElement("hbox", { pack: "center", style: "padding-left: 12px" });
    friendPane.appendChild(countsContainer);

    countsContainer.appendChild(createXULElement("spacer", { flex: 1 }));

    var linkCountContainer = createXULElement("hbox", { align: "center" });
    countsContainer.appendChild(linkCountContainer);
    linkCountContainer.appendChild(createXULElement("image", { src: "chrome://coop/skin/page_white_world.png" }));
    linkCountContainer.appendChild(createXULElement("label", { value: unseenLinks ? unseenLinks + " links" : "   " }));

    var pictureCountContainer = createXULElement("hbox", { align: "center" });
    countsContainer.appendChild(pictureCountContainer);
    pictureCountContainer.appendChild(createXULElement("image", { src: "chrome://coop/skin/camera.png" }));
    pictureCountContainer.appendChild(createXULElement("label", { value: "   " }));

    var videoCountContainer = createXULElement("hbox", { align: "center" });
    countsContainer.appendChild(videoCountContainer);
    videoCountContainer.appendChild(createXULElement("image", { src: "chrome://coop/skin/film.png" }));
    videoCountContainer.appendChild(createXULElement("label", { value: "   " }));

    countsContainer.appendChild(createXULElement("spacer", { flex: 1 }));

    var linksContainer = document.createElementNS(XUL_NS, "vbox");
    friendPane.appendChild(linksContainer);
    linksContainer.style.overflowY = "auto";
    linksContainer.setAttribute("flex", "1");

    //friendPane.appendChild(linksLabel);

    for each (var link in links) {
      //var linkContainer = document.createElementNS(XUL_NS, "vbox");
      var linkContainer = document.createElementNS(HTML_NS, "div");
      //linkContainer.style.clear = "right";
      //linkContainer.style.display = "block";
      linkContainer.style.margin = "6px";
      //linkContainer.setAttribute("flex", "1");

      //var linkLabel = document.createElementNS(XUL_NS, "description");
      var linkLabel = document.createElementNS(HTML_NS, "a");
      linkLabel.setAttribute("class", "text-link");
      //linkLabel.setAttribute("value", link.title);
      linkLabel.appendChild(document.createTextNode(link.title));
      linkLabel.setAttribute("href", link.modifiedURI);
      linkLabel.setAttribute("title", link.uri);
      linkLabel.setAttribute("onclick", "Coop.openURI(this.href); return false;");
      //linkLabel.setAttribute("crop", "center");
      //linkLabel.setAttribute("flex", "1");

      //var linkSummary = document.createElementNS(XUL_NS, "description");
      //linkSummary.appendChild(document.createTextNode(link.summary));
      var linkSummary = document.createTextNode(link.summary);

      var linkThumbnail;
      if (link.thumbnailURI) {
        //linkThumbnail = document.createElementNS(XUL_NS, "image");
        linkThumbnail = document.createElementNS(HTML_NS, "img");
        linkThumbnail.setAttribute("src", link.thumbnailURI);
        linkThumbnail.style.cssFloat = "right";
        linkThumbnail.style.maxWidth = "100px";
        linkThumbnail.style.maxHeight = "100px";
        linkContainer.style.margin = "6px 6px 6px 6px";
      }
      else
        linkThumbnail = null;

      var linkSeparator = document.createElementNS(HTML_NS, "hr");
      linkSeparator.style.clear = "all";

      linksContainer.appendChild(linkContainer);
      if (linkThumbnail)
        linkContainer.appendChild(linkThumbnail);
      linkContainer.appendChild(linkLabel);
      linkContainer.appendChild(document.createElementNS(HTML_NS, "br"));
      linkContainer.appendChild(linkSummary);
      if (link != links[links.length-1])
        linksContainer.appendChild(linkSeparator);
    }

    // The style setting here is a hack to get the button on the right hand
    // side of the sidebar.
    var moreBox = createXULElement("hbox", { style: "width: 2500px" });
    friendPane.appendChild(moreBox);
    moreBox.appendChild(createXULElement("spacer", { flex: 1 }));
    var moreButton = createXULElement("button", { label: "More >", oncommand: "Coop.openURI('http://www.facebook.com/shared.php')" });
    moreBox.appendChild(moreButton);

    this.showFriendPane();
  },

  openURI: function Coop_openURI(urlSpec) {
    var uri = this._ios.newURI(urlSpec, null, null);
    var browserDOMWindow = gMainWindow.
                           QueryInterface(Ci.nsIDOMChromeWindow).
                           browserDOMWindow;
    // XXX This should pay attention to the browser.link.open_newwindow pref,
    // but for some reason it opens links in new tabs regardless of the value
    // of that preference.
    browserDOMWindow.openURI(uri,
                             gMainWindow,
                             Ci.nsIBrowserDOMWindow.OPEN_DEFAULTWINDOW,
                             Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL);
  },

  markLinksSeen: function Coop_markLinksSeen(senderID) {
    this._log("mark links seen for " + senderID);
    this._fbs.markLinksSeen(senderID, null);
  },

  buildFriendsPane: function coop_buildFriendsPane() {
    var friendsPane = document.getElementById("friendsPane");
    while (friendsPane.hasChildNodes())
      friendsPane.removeChild(friendsPane.firstChild);

    var friends = this._fbs.getFriends().wrappedJSObject;

    for (var i = 0; i < friends.length; i++) {
      var friend = friends[i];

      var links = this._fbs.getLinks(friend.id, null).wrappedJSObject.links;

      var linksLabel = document.createElementNS(XUL_NS, "button");
      linksLabel.setAttribute("class", "friendLinks");
      var unseenLinks = 0;
      for each (var link in links)
        if (!link.seen)
          ++unseenLinks;

      var container = this.buildFriendWidget(friend, unseenLinks);
      container.setAttribute("onclick", "Coop.showFriend(this.getAttribute('personID'))");
      container.addEventListener("dragover", function(event) { nsDragAndDrop.dragOver(event, Coop) }, false);
      container.addEventListener("dragexit", function(event) { nsDragAndDrop.dragExit(event, Coop) }, false);
      container.addEventListener("dragdrop", function(event) { nsDragAndDrop.drop(event, Coop) }, false);
      friendsPane.appendChild(container);
    }
  },

  buildFriendWidget: function coop_buildFriendWidget(friend, linkCount, friendView) {
    var container = createXULElement("hbox", { "class": "friendContainer",
                                               personID: friend.id,
                                               personName: friend.name,
                                               view: friendView ? "friend" : "friends" });

    var portraitFrame = createXULElement("hbox");
    container.appendChild(portraitFrame);

    var portraitFrameLeft = createXULElement("vbox");
    portraitFrame.appendChild(portraitFrameLeft);
    portraitFrameLeft.appendChild(createXULElement("image", { src: "chrome://coop/skin/pic_left_top.png" }));
    portraitFrameLeft.appendChild(createXULElement("image", { src: "chrome://coop/skin/pic_left_side.png", flex: 1 }));
    portraitFrameLeft.appendChild(createXULElement("image", { src: "chrome://coop/skin/pic_left_bottom.png" }));

    var portraitFrameCenter = createXULElement("vbox");
    portraitFrame.appendChild(portraitFrameCenter);
    portraitFrameCenter.appendChild(createXULElement("image", { src: "chrome://coop/skin/pic_center_top.png" }));
    var portrait = createXULElement("vbox", { class: "portrait" });
    portrait.appendChild(createXULElement("image", { src: friend.pic || MISSING_PIC_URL,
                                                                   // What's this for?
                                                                   uid: friend.uid,
                                                                   tooltip: friend.name }));
    portraitFrameCenter.appendChild(portrait);
    portraitFrameCenter.appendChild(createXULElement("image", { src: "chrome://coop/skin/pic_center_bottom.png" }));

    var portraitFrameRight = createXULElement("vbox", { pack: "start" });
    portraitFrame.appendChild(portraitFrameRight);
    portraitFrameRight.appendChild(createXULElement("image", { src: "chrome://coop/skin/pic_right_top.png" }));
    portraitFrameRight.appendChild(createXULElement("image", { src: "chrome://coop/skin/pic_right_side.png", flex: 1 }));
    portraitFrameRight.appendChild(createXULElement("image", { src: "chrome://coop/skin/pic_right_bottom.png" }));

    var infoContainer = createXULElement("vbox");
    container.appendChild(infoContainer);

    var nameContainer = createXULElement("hbox", { "class": "nameContainer" });
    infoContainer.appendChild(nameContainer);
    nameContainer.appendChild(createXULElement("image", { src: "chrome://coop/skin/name_left.png" }));
    nameContainer.appendChild(createXULElement("label", { value: friend.name, crop: "end" }));
    nameContainer.appendChild(createXULElement("image", { src: "chrome://coop/skin/name_right.png" }));

    var countsContainer = createXULElement("vbox", { "class": "countsContainer", flex: 1 });
    infoContainer.appendChild(countsContainer);

    if (friendView) {
      var spacer = createXULElement("spacer", { flex: 1 });
      countsContainer.appendChild(spacer);

      var backButton = createXULElement("button");
      countsContainer.appendChild(backButton);
      backButton.setAttribute("label", "< Back");
      backButton.setAttribute("oncommand", "Coop.showFriendsPane()");
    }
    else {
      // Labeling the icons with some space makes them spread out more.
      var linkCountContainer = createXULElement("hbox", { align: "center" });
      countsContainer.appendChild(linkCountContainer);
      linkCountContainer.appendChild(createXULElement("image", { src: "chrome://coop/skin/page_white_world.png" }));
      linkCountContainer.appendChild(createXULElement("label", { value: linkCount ? linkCount + " links" : "   " }));
  
      var pictureCountContainer = createXULElement("hbox", { align: "center" });
      countsContainer.appendChild(pictureCountContainer);
      pictureCountContainer.appendChild(createXULElement("image", { src: "chrome://coop/skin/camera.png" }));
      pictureCountContainer.appendChild(createXULElement("label", { value: "   " }));
  
      var videoCountContainer = createXULElement("hbox", { align: "center" });
      countsContainer.appendChild(videoCountContainer);
      videoCountContainer.appendChild(createXULElement("image", { src: "chrome://coop/skin/film.png" }));
      videoCountContainer.appendChild(createXULElement("label", { value: "   " }));
    }

    return container;
  },


//****************************************************************************//
// Drag & Drop Handling

  onDragOver: function coop_onDragOver(event, flavour, session) {
    //this._log("onDragOver: " + event.target);
    event.currentTarget.style.outline = "3px solid #999999";
  },

  onDragExit: function coop_onDragExit(event, session) {
    //this._log("onDragExit: " + event.target);
    event.currentTarget.style.outline = "none";
  },

  onDrop: function coop_onDrop(event, xferData, session) {
    this._log("onDrop: " + event.target);
    var url = transferUtils.retrieveURLFromData(xferData.data, xferData.flavour.contentType);
    if (url)
      gMainWindow.gBrowser.dragDropSecurityCheck(event, session, url);
    var personID = event.currentTarget.getAttribute("personID");
    var account = this._fbs.getAccountForPerson(personID, null);
    if (account)
      account = account.wrappedJSObject;
    var personName = event.currentTarget.getAttribute("personName");
    this.shareURL(url, account.remoteID, personName);
  },

  getSupportedFlavours: function coop_getSupportedFlavours() {
    //this._log("getSupportedFlavours");
    var flavours = new FlavourSet();
    flavours.appendFlavour("text/x-moz-url");
    flavours.appendFlavour("text/unicode");
    return flavours;
  },


//****************************************************************************//
// URL Sharing

  shareURL: function coop_shareURL(url, personID, personName) {
    var sharerURL = "http://www.facebook.com/sharer.php?src=bm&v=4&u=" +
                    encodeURIComponent(url);
                    // + "&t=" + encodeURIComponent("the title, which we don't have");

    const params = Cc["@mozilla.org/embedcomp/dialogparam;1"].
                   createInstance(Ci.nsIDialogParamBlock);
    params.SetNumberStrings(3);
    params.SetString(0, sharerURL);
    params.SetString(1, personID);
    params.SetString(2, personName);

    var windowWatcher = Cc["@mozilla.org/embedcomp/window-watcher;1"].
                        getService(Ci.nsIWindowWatcher);
    var shareWindow = windowWatcher.openWindow(null,
                                               "chrome://coop/content/addLink.xul",
                                               "sharer",
                                               "chrome centerscreen",
                                               params);
  },


//****************************************************************************//
// Utilities

  _log: function coop__log(message) {
    CoopGlobal.log(message);
  }
};

function createElement(namespace, name, attributes) {
  var element = document.createElementNS(namespace, name);
  if (attributes)
    for (var key in attributes)
      element.setAttribute(key, attributes[key]);
  return element;
};

function createXULElement(name, attributes) {
  return createElement(XUL_NS, name, attributes);
};
