/*! child-tracker.js - v1.1.0 - 2016-09-27 */
/** @module ChildTracker */
(function(factory) {
    if (typeof define === 'function' && define.amd) {
        define(factory);
    }
    else if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        window.ChildTracker = factory.call(this);
    }
})(function() {
    var lib = {};

    // Underscore "now()" implementation
    var getNow = Date.now || function() {
        return new Date().getTime();
    };

    // Underscore throttle implementation
    function throttle(func, wait, options) {
        var context, args, result;
        var timeout = null;
        var previous = 0;
        if (!options) {options = {};}
        var later = function() {
            previous = options.leading === false ? 0 : getNow();
            timeout = null;
            result = func.apply(context, args);
            if (!timeout) {context = args = null;}
        };
        return function() {
            var now = getNow();
            if (!previous && options.leading === false) {previous = now;}
            var remaining = wait - (now - previous);
            context = this;
            args = arguments;
            if (remaining <= 0 || remaining > wait) {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                }
                previous = now;
                result = func.apply(context, args);
                if (!timeout) {context = args = null;}
            } else if (!timeout && options.trailing !== false) {
                timeout = setTimeout(later, remaining);
            }
            return result;
        };
    }

    // A simple wrapper for starting and clearing a timeout
    var Timer = function(callback, duration) {
        var alerter;

        function start() {
            if (callback && duration) {
                alerter = setTimeout(callback, duration);
            }
        }

        function stop() {
            clearTimeout(alerter);
        }

        return {
            start: start,
            stop: stop
        };
    };

    /**
     * Tracks how long an element is visible.
     *
     * @class Parent
     * @param {String} id The id of the element the tracker will watch.
     * @param {Function} callback Will be called on every new time bucket.
     * @param {Object} config Configuration to override the default settings.
     */
    lib.VisibilityTracker = function(pymParent, id, callback, config) {
        var WAIT_TO_ENSURE_SCROLLING_IS_DONE = 40;
        var WAIT_TO_MARK_READ = 500;
        var ANIMATION_DURATION = 800;

        var isVisible = false;

        var timer = new Timer(callback, WAIT_TO_MARK_READ);

        // Ensure a config object
        config = (config || {});

        function _parseRect(rect) {
            var rectArray = rect.split(' ');
            var rectObj = {
                'top': parseFloat(rectArray[0]),
                'left': parseFloat(rectArray[1]),
                'bottom': parseFloat(rectArray[2]),
                'right': parseFloat(rectArray[3])
            };

            return rectObj;
        }

        var sendRectRequest = function() {
            pymParent.sendMessage('request-client-rect', id);
        };

        function isElementInViewport(rect) {
            // Adapted from http://stackoverflow.com/a/15203639/117014
            //
            // Returns true only if the WHOLE element is in the viewport

            var iframeRect = pymParent.iframe.getBoundingClientRect();
            var vWidth   = window.innerWidth || document.documentElement.clientWidth;
            var vHeight  = window.innerHeight || document.documentElement.clientHeight;

            var verticalScroll = Math.abs(iframeRect.top) + vHeight;
            var realBottom = rect.top + (rect.bottom - rect.top);
            var bottomBound = realBottom + vHeight;

            // Track partial visibility.
            var leftSideIsToRightOfWindow = rect.left > vWidth;
            var rightSideIsToLeftOfWindow = rect.right < 0;
            var topIsBelowVisibleWindow = rect.top > verticalScroll;
            var bottomIsAboveVisibleWindow = verticalScroll > bottomBound || realBottom > verticalScroll;

            if (leftSideIsToRightOfWindow  ||
                rightSideIsToLeftOfWindow ||
                topIsBelowVisibleWindow   ||
                bottomIsAboveVisibleWindow) {
                return false;
            }

            return true;
        }

        function checkIfVisible(rect) {
            var newVisibility = isElementInViewport(rect);

            // Stop timer if annotation is out of viewport now
            if (isVisible && !newVisibility) {
                timer.stop();
            }

            if (!isVisible && newVisibility) {
                timer.start();
                pymParent.sendMessage('fact-check-visible', id);

                // @KLUDGE This is a pretty ugly bit of code that sends a second rectrequest
                // before the "read" timer has expired to force a check to see if an annotation
                // is still in the viewport. If isn't, the timer is reset until the annotation
                // appears in the viewport again.
                setTimeout(sendRectRequest, ANIMATION_DURATION);
            }

            isVisible = newVisibility;
            return newVisibility;
        }

        var handler = throttle(sendRectRequest, WAIT_TO_ENSURE_SCROLLING_IS_DONE);

        function stopTracking() {
            if (window.removeEventListener) {
                removeEventListener('DOMContentLoaded', handler, false);
                removeEventListener('load', handler, false);
                removeEventListener('scroll', handler, false);
                removeEventListener('resize', handler, false);
            }
        }

        // Listen to different window movement events
        if (window.addEventListener) {
            addEventListener('DOMContentLoaded', handler, false);
            addEventListener('load', handler, false);
            addEventListener('scroll', handler, false);
            addEventListener('resize', handler, false);
        }

        pymParent.onMessage(id + '-rect-return', function(rect) {
            var rectObj = _parseRect(rect);
            checkIfVisible(rectObj);
        });

        // Initialize
        sendRectRequest();

        return {
            'stopTracking': stopTracking
        };
    };
    return lib;
});