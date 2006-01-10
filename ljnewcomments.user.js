// LJ New Comments script
// version 0.5 
// $Id$
// Copyright (c) 2005,2006, Paul Wright
// Released under the GPL. 
// http://www.gnu.org/copyleft/gpl.html
//
// --------------------------------------------------------------------
//
// This is a Greasemonkey user script.  To install it, you need
// Greasemonkey 0.3 or later: http://greasemonkey.mozdev.org/
// Then restart Firefox and revisit this script.
// Under Tools, there will be a new menu item to "Install User Script".
// Accept the default configuration and install.
//
// To uninstall, go to Tools/Manage User Scripts,
// select "LJ New Comments", and click Uninstall.
//
// --------------------------------------------------------------------
// 
// ==UserScript==
// @name          LJ New Comments
// @namespace     http://www.noctua.org.uk/paul/
// @description   Remember which comments we've seen on LiveJournal.
// @include       http://www.livejournal.com/users/*
// @include       http://www.livejournal.com/community/*
// ==/UserScript==

if (!GM_log || !GM_setValue || !GM_getValue)
{
    alert("LJ New Comments script requires a more recent version of Greasemonkey. Please upgrade to the latest version.");
    return;
}

if (GM_getValue("debug"))
{
    // Log the given string with the current millisecond time, for profiling.
    function td_log(what)
    {
        var now = new Date();
        GM_log(now.valueOf() + ":" + what);
    }
}
else
{
    function td_log(what) {}
}

// Given an URL referring to LJ, return either an array of 3 elements being
// 0. user type (users or community)
// 1. user name
// 2. entry ID
// or return undefined if the URL is not an entry in someone's LJ.
function parse_lj_link(url)
{
    var m;
    // HERE: www.livejournal.com/~foo form
    if (m = url.match(/^http:\/\/www\.livejournal\.com\/(users|community)\/(\w+)\/(\d+)\.html/))
    {
        return m.slice(1);
    }
    else if (m = url.match(/^http:\/\/(\w+)\.livejournal.com\/(\d+)\.html/))
    {
        // Assume personalised LJ URLs are users rather than communities.
        return ["users", m[1], m[2]];
    }
    else
    {
        return undefined;
    }
}

// Find a thing in an array. Return the index or -1 if it's not found.
function find_in_array(what, array)
{
    for (var i = 0; i < array.length; i += 1)
    {
        if (array[i] == what)
            return i;
    }
    return -1;
}

// Retrieve a comma separated list as an Array, using GM_getValue
function get_list(key)
{
    var l;
    if (l = GM_getValue(key))
        return l.split(",");
    else
        return [];
}

// How the read comment storage works:
//
// We want to prevent the comment database growing without limit, but there's
// no GM_deleteValue at the time of writing. A trick suggested by Mark
// Pilgrim is to use a pool of keys and re-cycle them, so that old values
// are continually being overwritten.
//
// So, there's a pool of keys called "entry_N" where N is a number. We'll call
// them slots. In each slot there's a comma separated array of comment numbers
// for a particular entry.
//
// There are two arrays to keep track of entries. access_order holds the
// entries we know about in order of access, with the more recent ones at the
// head of the list. Each entry is kept in this list as the string
// userName!entryId eg "pw201!666"
// 
// slot_order holds the entries we know about in order the slots they're using.
// That is, if slot_order[5] = "pw201!666", then the GM key "entry_5" holds
// the comment numbers for pw201's entry number 666.
// 
// When we run out of spare slots, we take the key off the end of access_order
// (which is an entry the user hasn't looked at in a while), find which slot
// it uses and re-use that for the entry we're currently looking at.

// Store an array of the comment numbers we've seen for a given entry, given
// the username and entry id.
function store_comment_array(username, id, comment_list)
{
    var entry_key = username + "!" + id;
    var slot_order = get_list("slot_order");
    var access_order = get_list("access_order");
    var max_entries = GM_getValue("max_entries", 500);
    var slot_index = find_in_array(entry_key, slot_order);
    var access_index = find_in_array(entry_key, access_order);
    td_log("slot_index " + slot_index + " access_index " + access_index);
    if (slot_index != -1)
    {
        td_log("Known entry, moving to head of access_list");
        access_order.splice(access_index, 1);
        access_order.unshift(entry_key);
    }
    else
    {
        // Entry isn't known, either drop an entry to create space, or create
        // a new key.
        access_order.unshift(entry_key);
        if (access_order.length > max_entries)
        {
            // Too long, drop the oldest read entry
            var oldest_entry_key = access_order.pop();
            slot_index = find_in_array(oldest_entry_key, slot_order);
            slot_order[slot_index] = entry_key;
            td_log("Recycling slot " + slot_index + " holding " + oldest_entry_key);
        }
        else
        {
            // Use the next index until we start running out.
            slot_index = slot_order.length;
            slot_order.push(entry_key);
            td_log("Using new slot " + slot_index);
        }
    }
    td_log("Storing " + entry_key + "'s comments in slot " + slot_index);
    GM_setValue("slot_order", slot_order.join(","));
    GM_setValue("access_order", access_order.join(","));
    GM_setValue("entry_" + slot_index, comment_list.join(","));
}

// Retrieve an array of the comment numbers we've seen for a given entry, given
// the user name and entry id. Returns an empty list if the entry isn't one
// we've seen.
function get_comment_array(username, id)
{
    var entry_key = username + "!" + id;
    var slot_order = get_list("slot_order");
    var access_order = get_list("access_order");
    var comment_list;
    var slot_index = find_in_array(entry_key, slot_order);
    var access_index = find_in_array(entry_key, access_order);
    if (slot_index == -1)
    {
        // Not found. For backwards compatibility with old versions of the
        // script, we also look for the old style keys, which just used
        // the entry_key as a GM_key.
        var comment_list = get_list(entry_key);
        if (comment_list.length > 0)
        {
            // If we found an old style key, remove the text in it, and
            // store it in our new slot arrangement, so that the seen
            // comments are not lost.
            GM_setValue(entry_key,"");
            store_comment_array(username, id, comment_list);
            td_log("Converted old key " + entry_key);
        }
    }
    else
    {
        comment_list = get_list("entry_" + slot_index);
        td_log("Retrieved slot " + slot_index);
        // We remember reads as well, in case someone's looking at a 
        // friends or entry page to see whether there are new comments.
        access_order.splice(access_index,1);
        access_order.unshift(entry_key);
        GM_setValue("access_order", access_order.join(","));
    }

    return comment_list;
}


var thisLocation, userName, entryId; 

if (thisLocation = parse_lj_link(document.location.href))
{
    // We're on an entry page, store the relevant information from its URL.
    userType = thisLocation[0];
    userName = thisLocation[1];
    entryId = thisLocation[2];
}
else
{
    // Could be a friends or recent entries page, in which case we look for
    // links with nc=N on this page and add our knowledge of the number of new
    // comments to them, and then return. As a double check, we require the
    // link text to contain the same number as the nc=N parameter.
    var links = document.evaluate(
            '//a[contains(@href,"?nc=") or contains(@href,"&nc=")]',
            document,
            null,
            XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
            null);
    for (var i = 0; i < links.snapshotLength; i++)
    {
        var thisLink = links.snapshotItem(i);
        var parsedLink, ncMatch, linkTextMatch;
        if ((parsedLink = parse_lj_link(thisLink.href))
                && (ncMatch = thisLink.href.match(/[\?&]nc=(\d+)/))
                && (linkTextMatch = thisLink.firstChild.nodeValue.match(/\d+/))
                && (ncMatch[1] == linkTextMatch[0]))
        {
            // This doesn't cope with deleted comments, but there's not much I
            // can do about that.
            var commentArray = get_comment_array(parsedLink[1], parsedLink[2]);
            thisLink.firstChild.nodeValue += " (" + (ncMatch[1] - commentArray.length) + " new)";
        }
    }

    return;
}
td_log("userName " + userName);
td_log("entryId " + entryId);

var linkUrl = "http://www.livejournal.com/" + userType + "/" + userName + "/" + entryId + ".html";

// To test whether we've seen a number, we first convert the list into an
// associative array with keys as comment numbers (because there's no array
// indexOf method in the JS version I have, and a hash is probably quicker
// anyway).
var commentArray = get_comment_array(userName, entryId);
commentHash = new Object();
if (commentArray)
{
    for (var i = 0; i < commentArray.length; i++)
        commentHash[commentArray[i]] = 1;
}

td_log("Retrieved seen comments");

var allAnchors, thisAnchor, thisLink;

// Comments seem to be introduced with either elements with id attributes of
// the form ljcmtNNNN or tNNNN or anchors named tNNNN, or possibly both. To
// preserve the thread ordering, we need to find both with a single search
// using XPath, so we assume that anything with an ID or name of the right form
// is what we're after. God, I love LJ.
allAnchors = document.evaluate(
    '//*[starts-with(@id,"ljcmt") or starts-with(@name,"t") or starts-with(@id,"t")]',
    document,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null);
var newCommentAnchors = new Array(); // array of [name, object] pairs.
for (var i = 0; i < allAnchors.snapshotLength; i++)
{
    thisAnchor = allAnchors.snapshotItem(i);
    var m;
    // No xpath 2.0 regex support in Firefox, apparently, so filter more here. 
    // HERE: tidy
    if ((thisAnchor.id && ((m = thisAnchor.id.match(/^ljcmt(\d+)$/)) ||
            (m = thisAnchor.id.match(/^t(\d+)$/))) ||
            (thisAnchor.name && (m = thisAnchor.name.match(/^t(\d+)$/))))
            && !commentHash[m[1]])
    {
        td_log("Matched " + m);
        newCommentAnchors.push([m[0], thisAnchor]);
        commentHash[m[1]] = 1;
    }
}

// If there's nothing to do here, stop now.
if (newCommentAnchors.length == 0)
    return;

var newElement;
var nextComment = 0;

for (var i = 0; i < newCommentAnchors.length; i++)
{
    var thisAnchorName = newCommentAnchors[i][0];
    thisAnchor = newCommentAnchors[i][1];
    td_log(i + " " + thisAnchorName);

    var commentNumber = thisAnchorName.match(/\d+/)[0];
    td_log("commentNumber " + commentNumber);

    // Find a thread link following this anchor. This is probably a good place
    // to put a note that this is new, as in most styles it's pretty prominent
    // in the header or footer. Since LJ has no consistency in div class or
    // span names for different parts of the page, it's the best I can do. 
    thisLink = document.evaluate(
        './/following::a[starts-with(@href,"' + linkUrl + '?thread=' + commentNumber + '#t' + commentNumber + '")]',
        thisAnchor,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null).singleNodeValue;
    td_log("Search for comment link");

    // If we can't find the link, we can't mark it as new, but we can still let
    // the "n" key binding take us to it, so don't despair.
    if (thisLink)
    {
        // Make each entry on a new comment a link to the next new comment
        var nextCommentIndex = (i + 1) % newCommentAnchors.length;
        newElement = document.createElement('a');
        newElement.innerHTML = '<a href="javascript:void(0);">New</a>';
        thisLink.parentNode.insertBefore(newElement, thisLink.nextSibling);
        newElement.parentNode.insertBefore(document.createTextNode(" "), newElement);
        // When the link is clicked, update our value of the next comment for
        // the "n" key binding, and go to the nextCommentIndex'th element. That
        // means nextComment needs setting to the one after that. This is a bit
        // sick, as we need to remember the current nextCommentIndex inside the
        // function.
        newElement.addEventListener("click", eval("foo = function bar(event) { nextComment = " + ((nextCommentIndex + 1) % newCommentAnchors.length) + "; newCommentAnchors[" + nextCommentIndex + "][1].scrollIntoView(true);}"),
                true); 
        td_log("comment " + commentNumber + " is marked");
    }
}

// Remember the comments we saw. GM can only store strings, so we stuff
// everything back into a string, via an array's join method.    
var storedArray = new Array();
// There doesn't appear to be anything like Python's keys() method for
// associative arrays, pace all those web pages which claim that Javascript is
// a real programming language.
for (commentNumber in commentHash)
    storedArray.push(commentNumber);


if (storedArray.length > 0)
{
    store_comment_array(userName, entryId, storedArray);
    td_log("Storing " + storedArray);
}

// Set up the key binding for the "n" key.
function keypress_handler(event)
{
    var t = event.target;
    if (t && t.nodeName && (t.nodeName == "INPUT" || t.nodeName == "SELECT" || t.nodeName == "TEXTAREA"))
        return;
    if (event.which == 110) // 'n'
    {
        var obj = newCommentAnchors[nextComment][1];
        nextComment = (nextComment + 1) % newCommentAnchors.length;
        obj.scrollIntoView(true);
    }
    else if (event.which == 112) // 'p'
    {
        nextComment = (nextComment + newCommentAnchors.length - 1) % newCommentAnchors.length;
        var obj = newCommentAnchors[(nextComment + newCommentAnchors.length - 1) % newCommentAnchors.length][1];
        obj.scrollIntoView(true);
    }
}

document.addEventListener("keypress", keypress_handler, true);
td_log("added event listener");

// HERE: have mark all as read/unread option. Have mark thread as unread option
// using the JS array for the thread structure which LJ provide.

// Version  Date        Comment
// 0.1      2006-01-02  First version
// 0.2      2006-01-03  Cope with ljcmt ids and absence of comment permalinks,
//                      use scrollIntoView, add "p" key, make debug optional
// 0.3      2006-01-04  Yet more varieties of comment anchor/id thingies.
// 0.4      2006-01-04  Broke javascript, fixed it.
