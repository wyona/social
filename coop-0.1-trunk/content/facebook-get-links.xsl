<?xml version="1.0" encoding="UTF-8"?>
<!-- ***** BEGIN LICENSE BLOCK *****
   - Version: MPL 1.1/GPL 2.0/LGPL 2.1
   -
   - The contents of this file are subject to the Mozilla Public License Version
   - 1.1 (the "License"); you may not use this file except in compliance with
   - the License. You may obtain a copy of the License at
   - http://www.mozilla.org/MPL/
   -
   - Software distributed under the License is distributed on an "AS IS" basis,
   - WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
   - for the specific language governing rights and limitations under the
   - License.
   -
   - The Original Code is The Coop.
   -
   - The Initial Developer of the Original Code is Mozilla.
   - Portions created by the Initial Developer are Copyright (C) 2007
   - the Initial Developer. All Rights Reserved.
   -
   - Contributor(s):
   -   Myk Melez <myk@mozilla.org>
   -
   - Alternatively, the contents of this file may be used under the terms of
   - either the GNU General Public License Version 2 or later (the "GPL"), or
   - the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
   - in which case the provisions of the GPL or the LGPL are applicable instead
   - of those above. If you wish to allow use of your version of this file only
   - under the terms of either the GPL or the LGPL, and not to allow others to
   - use your version of this file under the terms of the MPL, indicate your
   - decision by deleting the provisions above and replace them with the notice
   - and other provisions required by the LGPL or the GPL. If you do not delete
   - the provisions above, a recipient may use your version of this file under
   - the terms of any one of the MPL, the GPL or the LGPL.
   -
   - ***** END LICENSE BLOCK ***** -->
<xsl:transform xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0">
  <xsl:output method="xml"/>
  <xsl:template match="/">
    <links>
      <xsl:apply-templates select="//div[contains(@class, 'sharebox_item')]"/>
    </links>
  </xsl:template>
  <xsl:template match="//div[contains(@class, 'sharebox_item')]">
    <link>
      <remoteID><xsl:value-of select="substring-after(@id, 's')"/></remoteID>
      <senderID><xsl:value-of select="substring-after(.//a[@class='owner']/@href, 'id=')"/></senderID>
      <uri><xsl:value-of select=".//div[@class='url']/a/@title"/></uri>
      <timestamp><xsl:value-of select=".//span[@class='share_timestamp']"/></timestamp>
      <title><xsl:value-of select=".//div[@class='title']"/></title>
      <summary><xsl:value-of select=".//div[@class='summary']"/></summary>
      <comment><xsl:value-of select=".//div[@class='owner_comment']"/></comment>
      <modifiedURI><xsl:value-of select=".//div[@class='url']/a/@href"/></modifiedURI>
      <thumbnailURI><xsl:value-of select=".//div[@class='share_thumb']/a/img/@src"/></thumbnailURI>
    </link>
  </xsl:template>
</xsl:transform>
