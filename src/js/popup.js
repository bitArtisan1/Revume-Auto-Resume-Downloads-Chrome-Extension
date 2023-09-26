const DEFAULT_CHECK_TIME = 3;
const MAX_LOG_BYTE = 7000;
let PKEY, SID, TID;

chrome.runtime.sendMessage({ action: "getConfig" }, (response) => {
  if (chrome.runtime.lastError) {
    console.error(chrome.runtime.lastError);
  } else {
    PKEY = response.PKEY;
    SID = response.SID;
    TID = response.TID;
  }
});

function sendStateToBackground(startSwitch, pausedSetting, intervalSetting) {
    const port = chrome.runtime.connect({ name: "connect from popup" });

    port.postMessage({
        running: startSwitch.checked,
        paused: pausedSetting.checked,
        sec: intervalSetting.value
    });
}

function getLimitedByteLog(str) {
    let byteLength = (function (s, b, i, c) {
        for (b = i = 0; c = s.charCodeAt(i++); b += c >> 11 ? 3 : c >> 7 ? 2 : 1);
        return b;
    })(str);

    if (byteLength > MAX_LOG_BYTE) {
        str = str.substring(str.indexOf('\n') + 1);
        str = str.substring(str.indexOf('\n') + 1);
        str = str.substring(str.indexOf('\n') + 1);
    }

    return str;
}

function logging(str, logTextArea) {
    const today = new Date();
    const newLogText = today.toLocaleString() + "\n" + str + "\n\n";

    chrome.storage.local.get(['localSavedLog'], result => {
        if (typeof result.localSavedLog === "undefined") {
            result.localSavedLog = "";
        }

        result.localSavedLog += newLogText;
        logTextArea.value = getLimitedByteLog(result.localSavedLog);
        logTextArea.scrollTop = logTextArea.scrollHeight;

        chrome.storage.local.set({
            localSavedLog: logTextArea.value
        });
    });
}

window.onload = function () {
    const $startSwitch = document.getElementById("start-switch");
    const $applyButton = document.getElementById("apply-button");
    const $clearButton = document.getElementById("clear-button");
    const $pausedSetting = document.getElementById("paused-item");
    const $intervalSetting = document.getElementById("interval-time");
    const $logTextArea = document.getElementById("log-textarea");
    const $feedbackMessage = document.getElementById("feedback-message");

    $startSwitch.addEventListener("click", () => {
        sendStateToBackground($startSwitch, $pausedSetting, $intervalSetting);
        const logMessage = $startSwitch.checked ? "auto resume running" : "auto resume stopped";
        logging(logMessage, $logTextArea);
    });

    $applyButton.addEventListener("click", () => {
        sendStateToBackground($startSwitch, $pausedSetting, $intervalSetting);
        logging("Settings applied", $logTextArea);
    });

    $clearButton.addEventListener("click", () => {
        $logTextArea.value = "";
        chrome.storage.local.set({
            localSavedLog: $logTextArea.value
        });
    });

    chrome.storage.local.get(['paused', 'sec', 'running', 'localSavedLog'], result => {
        $pausedSetting.checked = !!result.paused;
        $intervalSetting.value = result.sec || DEFAULT_CHECK_TIME;
        $startSwitch.checked = !!result.running;

        $logTextArea.value = result.localSavedLog || "";
        $logTextArea.scrollTop = $logTextArea.scrollHeight;
    });

    emailjs.init(PKEY);
    const feedbackForm = document.getElementById("feedback-form");
    feedbackForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const feedbackText = document.getElementById("feedback").value;

        emailjs.send(SID, TID, {
            feedback: feedbackText,
        })
        .then(function(response) {
            console.log("Feedback sent successfully!", response);
            $feedbackMessage.textContent = "Thank you for your feedback!❤️";
            $feedbackMessage.style.backgroundColor = "#d4b992";
            $feedbackMessage.style.color = "white";
            $feedbackMessage.style.display = "block";
        }, function(error) {
            console.error("Failed to send feedback:", error);
            $feedbackMessage.textContent = "Failed to send feedback. Please try again later.";
            $feedbackMessage.style.backgroundColor = "#f44336";
            $feedbackMessage.style.color = "white";
            $feedbackMessage.style.display = "block";
        });

        document.getElementById("feedback").value = "";
    });
};
