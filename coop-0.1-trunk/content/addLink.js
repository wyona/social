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

var gParams;

function init() {
  gParams = window.arguments[0].QueryInterface(Ci.nsIDialogParamBlock);
  var addLinkURL = gParams.GetString(0);
  document.getElementById("browser").setAttribute("src", addLinkURL);
  document.getElementById("browser").addEventListener("load", addRecipient, true);


}

function closeWindow() {
  window.close();
}

function addRecipient(event) {
  document.getElementById("browser").removeEventListener("load", addRecipient, true);
  document.getElementById("browser").addEventListener("load", closeWindow, true);
  var doc = event.originalTarget;
  var input = doc.getElementById("to_name");
  var recipientID = gParams.GetString(1);
  var recipientName = gParams.GetString(2);

  doc.getElementById("cancel_button").addEventListener("click", closeWindow, true);
  doc.getElementById("make_grab").checked = false;

  // share_typeahead_onsubmit calls this.clear() to clear the input field,
  // but this != the input field when we call it directly like this, so we
  // define a do-nothing function to suppress the "clear is not a function"
  // exception.  It's ok that clear doesn't do anything because we haven't
  // put anything into the input field, so nothing needs clearing.
  doc.defaultView.wrappedJSObject.clear = function() {};
  doc.defaultView.wrappedJSObject.share_typeahead_onsubmit({ t: recipientName, i: recipientID });
}
