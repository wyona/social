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

/**
 * Functionality common to multiple Coop-related JS contexts.
 **/
var CoopGlobal = {
  /**
   * The pref branch service.
   *
   * See the getPref method below for a simpler way to get the user or default
   * preference for a particular setting.
   **/
  _prefs: null,
  get prefs() {
    if (!this._prefs)
      this._prefs = Cc["@mozilla.org/preferences-service;1"].
                     getService(Ci.nsIPrefBranch);
    return this._prefs;
  },

  /**
   * Get a value from a pref or a default value if the pref doesn't exist.
   *
   * @param   prefName      the name of the pref to retrieve the value of
   * @param   defaultValue  (optional) the default value
   * @returns the pref's value, if any; otherwise, the default value
   **/
  getPref: function cg_getPref(prefName, defaultValue) {
    try {
      switch (this.prefs.getPrefType(prefName)) {
      case Ci.nsIPrefBranch.PREF_BOOL:
        return this.prefs.getBoolPref(prefName);
      case Ci.nsIPrefBranch.PREF_INT:
        return this.prefs.getIntPref(prefName);
      case Ci.nsIPrefBranch.PREF_STRING:
        return this.prefs.getCharPref(prefName);
      }
    }
    catch (ex) { /* return the default value */ }
    
    return defaultValue;
  },

  /**
   * Log a message to the console and Error Console if the extensions.coop.log
   * preference is set to true (it's set to false by default).
   *
   * @param   message  the message to log to the consoles
   **/
  log: function cg_log(message) {
    if (!this.getPref("extensions.coop.log", false))
      return;
  
    message = "*** coop: " + message;
    dump(message + "\n");
    var consoleService = Components.classes["@mozilla.org/consoleservice;1"].
                         getService(Components.interfaces.nsIConsoleService);
    consoleService.logStringMessage(message);
  },

  enumerateProperties: function cg_enumerateProperties(obj, excludeComplexTypes) {
    var properties = "";
    for (var p in obj) {
      try {
        if (excludeComplexTypes && (typeof obj[p] == 'object' || typeof obj[p] == 'function'))
          next;
        properties += p + " = " + obj[p] + "\n";
      }
      catch(ex) {
        properties += p + " = " + ex + "\n";
      }
    }
    return properties;
  }

};
