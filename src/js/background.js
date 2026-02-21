import { PKEY, SID, TID } from './config.js';

const DEFAULT_CHECK_INTERVAL = 3;
const MAX_CHECK_INTERVAL = 10000;
const MIN_CHECK_INTERVAL = 1;
const MAX_LOG_SIZE = 7000;
let downloadCheckIntervals = [];
let checkInterval = DEFAULT_CHECK_INTERVAL;
let resumePausedDownloads = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getConfig") {
        sendResponse({ PKEY, SID, TID });
    }
});

function getValidInterval(interval) {
    let validInterval = Number(interval);
    if (validInterval <= 0)
        validInterval = MIN_CHECK_INTERVAL;
    else if (validInterval > MAX_CHECK_INTERVAL)
        validInterval = MAX_CHECK_INTERVAL;
    else if (isNaN(validInterval))
        validInterval = DEFAULT_CHECK_INTERVAL;
    return validInterval;
}

function stopAllIntervals(intervals) {
    intervals.forEach(intervalId => clearInterval(intervalId));
    return [];
}

function getLimitedLog(log) {
    let byteLength = (function (str) {
        let bytes = 0;
        for (let i = 0; i < str.length; i++) {
            let charCode = str.charCodeAt(i);
            bytes += charCode >> 11 ? 3 : charCode >> 7 ? 2 : 1;
        }
        return bytes;
    })(log);

    if (byteLength > MAX_LOG_SIZE) {
        log = log.substring(log.indexOf('\n') + 1);
        log = log.substring(log.indexOf('\n') + 1);
        log = log.substring(log.indexOf('\n') + 1);
    }

    return log;
}

function logMessage(message) {
    chrome.storage.local.get(['localSavedLog'], result => {
        let localLog = typeof result.localSavedLog !== "undefined" ? result.localSavedLog : "";
        localLog += message + "\n\n";
        localLog = getLimitedLog(localLog);
        chrome.storage.local.set({
            localSavedLog: localLog
        });
    });
}

function resumeSingleDownload(downloadItem) {
    if (downloadItem.canResume && (!downloadItem.paused || resumePausedDownloads)) {
        chrome.downloads.resume(downloadItem.id, function () {
            logMessage("Resumed: " + downloadItem.filename);
        });
    }
}

function resumeDownloads(downloadItems) {
    downloadItems.forEach(resumeSingleDownload);
}

function searchAndResumeDownloads(query = {}) {
    chrome.downloads.search(query, resumeDownloads);
}

function toggleAutoResume(toggle) {
    if (toggle) {
        downloadCheckIntervals = stopAllIntervals(downloadCheckIntervals);
        const newInterval = setInterval(() => searchAndResumeDownloads(), checkInterval * 1000);
        downloadCheckIntervals.push(newInterval);
    } else {
        downloadCheckIntervals = stopAllIntervals(downloadCheckIntervals);
    }

    chrome.storage.local.set({
        running: toggle
    });
}

chrome.storage.local.get(['paused'], result => {
    resumePausedDownloads = result.paused;
});

chrome.storage.local.get(['sec'], result => {
    checkInterval = getValidInterval(result.sec);
});

chrome.storage.local.get(['running'], result => {
    if (result.running) {
        toggleAutoResume(true);
    }
});

chrome.runtime.onConnect.addListener(port => {
    port.onMessage.addListener(message => {
        checkInterval = getValidInterval(message.sec);
        resumePausedDownloads = message.paused;

        chrome.storage.local.set({
            paused: resumePausedDownloads,
            sec: checkInterval
        });

        toggleAutoResume(message.running);
    });
});
