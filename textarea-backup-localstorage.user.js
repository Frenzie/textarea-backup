// ==UserScript==
// @name		Textarea Backup Localstorage
// @author		Frans de Jonge (Frenzie)
// @version		1.12
// @namespace		http://extendopera.org/userjs/content/textarea-backup-localstorage
// @description		Retains text entered into textareas.
// @include		*
// @exclude		http://mail.google.com/*
// @exclude		https://mail.google.com/*
// ==/UserScript==
// This script is based on http://userscripts.org/scripts/show/42879 which is based on http://userscripts.org/scripts/show/7671
// Changelog
// 1.12 July 25, 2013.
// - Trustworthy old persistent preferences support added.
// - Fixed the keep_after_submission bug, so setting it to false is safe again.
// - Removed the form requirement.
// 1.11 July 24, 2013. Added configuration switches for the new feature.
// 1.10 July 23, 2013. Added support for dynamically added textareas.
// 1.03 December 27, 2012. Listen on the modern "input" event instead of "keypress". Changed keep_after_submission a little  due to problems with LibraryThing. Finally implemented the fix suggested by movax.
// 1.02 March 10, 2010. Faux-patched a variable leak bug. Still investigating the real cause.
// 1.01 March 10, 2010. Fixed bug where localStorage values not set by this script were often accidentally deleted.
// 1.0 March 7, 2010. Initial release.

/* 
You can put the settings in a separate file based on a template like this:

window.opera.UJSTextareaBackupSettings = {
	menu_display : true,
}
*/

// Tell JSHint that we don't need warnings about multiline strings. It's not like e.g. localStorage even works on older browsers.
// Don't need warnings about ommitting {}. It's just faster sometimes.
/*jshint multistr: true, curly: false */

(function () {
'use strict';
	
/* Preferences */

// Blatantly based on the MyOpera Enhancements settings system.
var defaultScriptSettings = {

/********************************/
/**** Begin editable section ****/
/********************************/

	//*** Toggle core functions.
	// Whether to display the menu.
	menu_display : /*@Display menu@bool@*/true/*@*/,
	// Backup when input event triggers.
	input_backup : /*@Backup on keypress@bool@*/true/*@*/,
	// Backup when textarea loses focus.
	blur_backup : /*@Backup on blur (when textarea loses focus)@bool@*/true/*@*/,
	// backup at time interval
	timed_backup : /*@Timed backup@bool@*/false/*@*/,
	// backup time interval, in millisecond
	backup_interval : /*@_Backup interval (ms)@int@*/10000/*@*/,
	// Keep backup even if successfully submitted.
	// Make sure expiration is enabled or the backup will never be deleted.
	// Even if set to false, this won't do anything on textareas that aren't in a form.
	keep_after_submission : /*@Keep backup after submission@bool@*/true/*@*/,
	
	// Restore saved content automatically.
	restore_auto : /*@Restore automatically@bool@*/true/*@*/,
	// Ask for confirmation before automatically restoring when the target textarea of is not empty.
	// You can still manually restore using the menu if set to false.
	ask_overwrite : /*@_Ask before overwriting@bool@*/true/*@*/,
	
	//*** Emphasize the availability of a backup.
	// Emphasize the fact that a backup available in the menu handle. This only works if restore_auto is set to false.
	em_available : /*@_Emphasize backup available (only works if automatic restoring is disabled)@bool@*/true/*@*/,
	// The color with which to emphasize. The default is a shade of red.
	em_color : /*@__Emphasizing color@string@*/'hsla(0, 100%, 50%, .4)'/*@*/,
	
	//*** Auxiliary variables to compute expiry_timespan.
	// Set all 0 to disable expiration.
	expire_after_days : /*@Expire after days@int@*/1/*@*/,
	expire_after_hours : /*@Expire after hours@int@*/12/*@*/,
	expire_after_minutes : /*@Expire after minutes@int@*/30/*@*/,
	
	//*** Toggle backup on dynamically inserted textareas.
	// Backup dynamically inserted textareas using Mutation Observers. Performance is usually fine. This won't do anything on Opera 10.50-12.16.
	backup_MutationObserver : /*@Backup dynamically inserted textareas using Mutation Observers. Performance is usually fine. This won't do anything on Opera 10.50-12.16@bool@*/true/*@*/,
	// Backup dynamically inserted textareas using the deprecated DOMNodeInserted event. This will work on Opera 10.50-12.16 but performance might suffer on slower computers and very complex websites.
	backup_DOMNodeInserted : /*@Backup dynamically inserted textareas using the deprecated DOMNodeInserted event. This will work on Opera 10.50-12.16 but performance might suffer on slower computers and very complex websites.@bool@*/false/*@*/,

/******************************/
/**** End editable section ****/
/******************************/
};

// Copy settings to variables for easier use later.
var userSets = (typeof opera.UJSTextareaBackupSettings !== 'undefined') ? opera.UJSTextareaBackupSettings : defaultScriptSettings;

var menu_display = (typeof userSets.menu_display !== 'undefined') ? userSets.menu_display : defaultScriptSettings.menu_display;
var input_backup = (typeof userSets.input_backup !== 'undefined') ? userSets.input_backup : defaultScriptSettings.input_backup;
var blur_backup = (typeof userSets.blur_backup !== 'undefined') ? userSets.blur_backup : defaultScriptSettings.blur_backup;
var timed_backup = (typeof userSets.timed_backup !== 'undefined') ? userSets.timed_backup : defaultScriptSettings.timed_backup;
var backup_interval = (typeof userSets.backup_interval !== 'undefined') ? userSets.backup_interval : defaultScriptSettings.backup_interval;
var keep_after_submission = (typeof userSets.keep_after_submission !== 'undefined') ? userSets.keep_after_submission : defaultScriptSettings.keep_after_submission;
var restore_auto = (typeof userSets.restore_auto !== 'undefined') ? userSets.restore_auto : defaultScriptSettings.restore_auto;
var ask_overwrite = (typeof userSets.ask_overwrite !== 'undefined') ? userSets.ask_overwrite : defaultScriptSettings.ask_overwrite;
var em_available = (typeof userSets.em_available !== 'undefined') ? userSets.em_available : defaultScriptSettings.em_available;
var em_color = (typeof userSets.em_color !== 'undefined') ? userSets.em_color : defaultScriptSettings.em_color;
var expire_after_days = (typeof userSets.expire_after_days !== 'undefined') ? userSets.expire_after_days : defaultScriptSettings.expire_after_days;
var expire_after_hours = (typeof userSets.expire_after_hours !== 'undefined') ? userSets.expire_after_hours : defaultScriptSettings.expire_after_hours;
var expire_after_minutes = (typeof userSets.expire_after_minutes !== 'undefined') ? userSets.expire_after_minutes : defaultScriptSettings.expire_after_minutes;
var backup_MutationObserver = (typeof userSets.backup_MutationObserver !== 'undefined') ? userSets.backup_MutationObserver : defaultScriptSettings.backup_MutationObserver;
var backup_DOMNodeInserted = (typeof userSets.backup_DOMNodeInserted !== 'undefined') ? userSets.backup_DOMNodeInserted : defaultScriptSettings.backup_DOMNodeInserted;

/* Code */
// GM compatibility
if (typeof unsafeWindow !== 'undefined') {
	window = unsafeWindow;
}
var myLocalStorage = window.localStorage;

// expiry time for a backup, in millisecond
var expiry_timespan = (((expire_after_days * 24) + expire_after_hours) * 60 + expire_after_minutes) * 60000;

// It's better to define this separately, I guess.
var i;

var querySelector = 'textarea'; // Change to 'textarea, [contentEditable]' for contentEditable support. Not yet implemented.

function getAbsolutePosition(element,direction) {
	var ele = element, dir = direction, pos, tempEle;
	pos = (dir==='x') ? ele.offsetLeft : ele.offsetTop;
	
	tempEle = ele.offsetParent;
	while(tempEle !== null) {
		pos += (dir==='x') ? tempEle.offsetLeft : tempEle.offsetTop;
		tempEle = tempEle.offsetParent;
	}
	return pos;
}

function getValue(key) {
	var value = myLocalStorage[key];
	return ( value && (value !== 'undefined') ) ? value : '';
}
function setValue(key, value) {
	myLocalStorage[key] = value;
}
function deleteValue(key) {
	myLocalStorage.removeItem(key);
}

// moved this function out of SaveTextArea
// for expiration check routine use
function is_significant(str) {
	return typeof str === 'string' &&
		str.replace(/\s+/g, '').length > 0;
}
function append_time_stamp(str) {
	return str + '@' + (new Date()).getTime();
}
function remove_time_stamp(str) {
	var time_pos = str.search(/@\d+$/);
	return (time_pos !== -1) ? str.substring(0, time_pos) : str;
}
function get_time_stamp(str) {
	var time_pos = str.search(/@\d+$/);
	return str.substring(time_pos + 1);
}

var init = {
	inserted: function(e) {
		var potential_ta = e.target, self = init;
		
		self.filter(potential_ta);
	},
	filter: function(potential_ta) {
		var self = this;
		
		// If it's a node with children, it'll have querySelectorAll on it.
		if (typeof potential_ta.querySelectorAll !== 'undefined') {
			var querySelectorResults = potential_ta.querySelectorAll(querySelector);
			self.real(querySelectorResults);
		}
		// A single inserted node could just be text. But if it's actually an element and a textarea, push it through.
		else if (typeof potential_ta.tagName !== 'undefined' && potential_ta.tagName.toLowerCase() === 'textarea') {
			// It's just one element, but we pass it as an array because of how init.real() works.
			self.real([potential_ta]);
		}
	},
	real: function(textareas) {
		for (var i = 0; i < textareas.length; i++) {
			new SaveTextArea(textareas[i]);
		}
	}
};

function SaveTextArea(txta) {
	this.ta = (typeof txta === 'string' ?
		document.getElementById(txta) : txta);

	this.initial_txt = this.ta.textContent;
	this.committed = '';

	this.listen();
	this.restore();
}
SaveTextArea.prototype = {
	listen: function() {
		var self = this;
		// Save buffer every keystroke.
		if (input_backup) {
			this.ta.addEventListener('input', function() {
				self.commit(self.ta.value);
			}, true);
		}

		// Save buffer when the textarea loses focus.
		if (blur_backup) {
			this.ta.addEventListener('blur', function() {
				self.commit();
			}, true);
		}

		// Save buffer every second.
		if (timed_backup) {
			this._stay_tuned();
		}

		// keep_after_submission is only relevant if there actually is a form.
		if (!keep_after_submission && this.ta.form) {
			// Delete buffer when the form has been submitted.
			this.ta.form.addEventListener('submit', function() {
				deleteValue(self.key());
			}, true);
		}
	},
	_stay_tuned: function() {
		var self = this;
		setTimeout(function() {
			self.commit();
			self._stay_tuned();
		}, backup_interval);
	},
	menu: function(emphasize) {
		var em = emphasize, self = this, taMenu = document.createElement('div'), menuList = document.createElement('ul'), li = document.createElement('li'), a, opacity = '.2';
		
		//opera.postError(this.ta.style.borderTopWidth);
		//var offsetTop = this.ta.style.borderTopWidth + this.ta.style.marginTop + getAbsolutePosition(this.ta, 'y');
		var offsetTop = getAbsolutePosition(this.ta, 'y');
		//var offsetRight = window.innerWidth - (getAbsolutePosition(this.ta, 'x')+this.ta.offsetWidth+this.ta.style.marginLeft+this.ta.style.marginRight);
		var offsetRight = window.innerWidth - (getAbsolutePosition(this.ta, 'x')+this.ta.offsetWidth);

		var style = document.createElement('style');
		style.setAttribute('type', 'text/css');
		style.textContent = '\
			.textarea_backup_menu {\
				border: 2px solid hsla(0, 0%, 0%, .8);\
				border-width: 0 2px 2px 2px;\
				border-radius: 0 0 5px 5px;\
				text-align: left;\
				padding: 0;\
				background: hsl(200, 30%, 90%);\
				color: hsla(0, 0%, 0%, 0);\
				font-size: 12px;\
				font-family: "Deja Vu Sans", Verdana;\
				opacity: '+opacity+';\
				position: absolute;\
				z-index: 1000;\
				width: 12px;\
				height: 12px;\
				overflow: hidden;\
				top: '+offsetTop+'px;\
				right: '+offsetRight+'px;\
				transition-property: background, width, height, color;\
				transition-duration: .5s, .5s, .5s, .5s;\
				transition-delay: 0s, 0s, 0s, .5s;\
			}\
			.textarea_backup_menu ul {\
				margin: 0;\
				padding: 0;\
				list-style: none;\
				height: 0;\
				overflow: hidden;\
				transition-property: height;\
				transition-duration: .5s;\
			}\
			.textarea_backup_menu li {\
				margin: 0;\
				padding: 0;\
			}\
			.textarea_backup_menu a {\
				display: block;\
				width: 100%;\
				padding: 5px;\
				border-top: 1px solid #000;\
				color: hsla(0, 0%, 0%, .1);\
				transition-property: color;\
				transition-duration: .5s;\
				transition-delay: .5s;\
			}\
				.textarea_backup_menu:hover a, .textarea_backup_menu:focus a {\
					height: auto;\
					color: hsl(230, 70%, 10%);\
				}\
			.textarea_backup_menu li a:hover {\
				background: hsla(100, 100%, 100%, .8);\
			}\
			.textarea_backup_menu:hover, .textarea_backup_menu:focus {\
				opacity: 1;\
				width: auto;\
				height: auto;\
				color: #000;\
			}\
			.textarea_backup_menu:hover ul, .textarea_backup_menu:focus ul {\
				height: auto;\
			}\
		';
		if (typeof document.head === 'object') {
			document.head.appendChild(style); // only works in Opera 11 and up
		}
		else {
			document.querySelector('head').appendChild(style); // retain 10.50 compatibility for now
		}
		if (em) {
			taMenu.style.opacity = 1;
			taMenu.style.backgroundColor = em_color;
		}
		
		taMenu.className = 'textarea_backup_menu';
		//taMenu.textContent = 'Textarea Backup Actions';
		
		taMenu.appendChild(menuList);
		
		// Define all the actions that should go in the menu
		var menuFunctions = [];
		menuFunctions[menuFunctions.length] = [
			'Restore previous backup for ' + this.ref(),
			function() { self.ta.value = self.previous_backup; }
		];
		menuFunctions[menuFunctions.length] = [
			'Delete previous backup for ' + this.ref(),
			function() {
				if (confirm('Delete previous backup for ' + self.ref() + '?')) {
					deleteValue(self.key());
					this.parentNode.removeChild(this);
				}
			}
		];
		menuFunctions[menuFunctions.length] = [
			'Clear ' + this.ref(),
			function() {
				if(confirm('Clear ' + self.ref() + '?')) {
					self.ta.value = '';
				}
			}
		];
		
		for (var i in menuFunctions) {
			// Checking if there are no outside "menuFunctions" leaking into the script. Thanks to movax for the fix.
			if ( menuFunctions.hasOwnProperty(i) ) {
				a = document.createElement('a');
				
				menuList.appendChild(li);
				li.appendChild(a);
				a.textContent = menuFunctions[i][0];
				a.addEventListener('click', menuFunctions[i][1], false);
			}
		}
		
		var body = document.body;
		body.appendChild(taMenu);
	},
	restore: function() {
		var em;
		// backup text is in format of "backup_content@save_time",
		// where save_time is the millisecond from Javascript Date object's getTime()
		var buff = remove_time_stamp(getValue(this.key()));
		
		// Only restore buffer if previously saved (i.e form not submitted).
		if(!is_significant(buff))
			return;
		
		//myLocalStorage['tab_temp'] = this.ta.textContent;
		//opera.postError(typeof buff);
		//opera.postError(typeof myLocalStorage['tab_temp']);
		//opera.postError(buff == myLocalStorage['tab_temp']);
		
		// Check with user before overwriting existing content with backup.
		if (buff !== this.ta.textContent && is_significant(this.ta.textContent) && ask_overwrite) {
			this._confirm_restore(buff);
		}
		else {
			if (restore_auto)
				this.ta.value = buff;
			else if (em_available)
				em = true;
		}

		//this.previous_backup = this.ta.value;
		this.previous_backup = buff;

		if (menu_display)
			this.menu(em);
	},
	_confirm_restore: function(buff) {
		var to_restore = remove_time_stamp(getValue(this.key()));
		
		// Keep existing border so it's not lost when highlighting.
		this.old_border = this.ta.style.border;

		var msg = "[Textarea Backup] Existing text detected in '" + this.ref() + "', overwrite with this backup?\n\n";
		msg += to_restore.length > 750 ? to_restore.substring(0, 500) + "\n..." : to_restore;
		
		this.confirming = true;
		this.ta.scrollIntoView();
		
		// Highlight the textarea that the confirm message refers to.
		this._highlight_textarea(this.old_border);

		// Let the user see the existing content as Firefox will sometimes
		// maintain the old value.
		this.ta.value = this.ta.textContent;
		if (window.confirm(msg))
			this.ta.value = buff;

		this.confirming = false;
		this.ta.style.border = this.old_border;
	},
	_highlight_textarea: function(border, toggle) {
		var self = this;
		
		setTimeout(function(ta_border, toggle) {
			if(self.confirming) {
				self.ta.style.border = ( toggle ? '3px red solid' : ta_border );
				self._highlight_textarea(ta_border, toggle);
			} else
				self.ta.style.border = this.old_border;
		}, 1000, border, !toggle);

		return this.ta.style.border;
	},
	commit: function() {
		this.committed = append_time_stamp(this.ta.value);
		
		// Only save if:
		// a) There's significant text in the <textarea>.
		// b) The text that was there when the page loaded has changed.
		if(is_significant(this.committed) && this.initial_txt !== this.committed)
			setValue( this.key(), this.committed );
	},
	// Rough'n'ready method which should be nicer.
	key: function()	{
		// If there are two textareas and neither of them have a name or id
		// then they will collide, but a textarea without either would be useless.
		return this.ta.baseURI + ';' + this.ref();
	},
	// Attempt to return the most appropriate textarea reference.
	ref: function() {
		return this.ta.id || this.ta.name || '';
	}
};

// expiration check routine
if (expiry_timespan > 0) {
	// get all associated backups, and compare timestamp now and then
	var curr_time = (new Date()).getTime();
	for (i=0;i<myLocalStorage.length;i++) {
		var curr_bak = getValue(myLocalStorage.key(i));
		var bak_text = remove_time_stamp(curr_bak);
		var bak_time = get_time_stamp(curr_bak);
		// also remove empty backups
		if ( (curr_time - bak_time >= expiry_timespan)	|| (!is_significant(bak_text)) ) {
			deleteValue(myLocalStorage.key(i));
		}
	}
}

// Init for dynamically inserted elements.
var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;

if (typeof MutationObserver !== 'undefined' && backup_MutationObserver === true) {
	var observer = new MutationObserver(function(mutations) {  
		mutations.forEach(function(mutation) {
			for (var i = 0; i < mutation.addedNodes.length; i++) {
				init.filter(mutation.addedNodes[i]);
			}
		});
	});
	
	observer.observe(document.body, { subtree: true, childList: true });
}
else if (backup_DOMNodeInserted === true) {
	// Init on DOMNodeInserted
	document.addEventListener('DOMNodeInserted', init.inserted);
}

// Init on DOMContentLoaded (when .user.js is loaded automatically).
var textareas = document.querySelectorAll(querySelector);
init.real(textareas);
})();