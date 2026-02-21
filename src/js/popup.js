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

function updatePowerUI(isActive) {
    const $statusText = document.getElementById("status-text");
    if ($statusText) {
        $statusText.textContent = isActive ? "ACTIVE" : "INACTIVE";
    }
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    chrome.storage.local.set({ theme });
}

window.onload = function () {
    const $startSwitch    = document.getElementById("start-switch");
    const $applyButton    = document.getElementById("apply-button");
    const $clearButton    = document.getElementById("clear-button");
    const $pausedSetting  = document.getElementById("paused-item");
    const $intervalSetting = document.getElementById("interval-time");
    const $logTextArea    = document.getElementById("log-textarea");
    const $feedbackMessage = document.getElementById("feedback-message");
    const $themeToggle    = document.getElementById("theme-toggle");
    const $numDec         = document.getElementById("num-dec");
    const $numInc         = document.getElementById("num-inc");

    // ── Theme toggle ──────────────────────────────────────────────────
    $themeToggle.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme") || "dark";
        applyTheme(current === "dark" ? "light" : "dark");
    });

    // ── Interval stepper buttons ──────────────────────────────────────
    if ($numDec) {
        $numDec.addEventListener("click", () => {
            const v = parseInt($intervalSetting.value, 10);
            if (v > 1) $intervalSetting.value = v - 1;
        });
    }
    if ($numInc) {
        $numInc.addEventListener("click", () => {
            const v = parseInt($intervalSetting.value, 10);
            $intervalSetting.value = v + 1;
        });
    }

    // ── Power switch ──────────────────────────────────────────────────
    $startSwitch.addEventListener("click", () => {
        sendStateToBackground($startSwitch, $pausedSetting, $intervalSetting);
        updatePowerUI($startSwitch.checked);
        const logMessage = $startSwitch.checked ? "auto resume running" : "auto resume stopped";
        logging(logMessage, $logTextArea);
    });

    // ── Apply settings ────────────────────────────────────────────────
    $applyButton.addEventListener("click", () => {
        sendStateToBackground($startSwitch, $pausedSetting, $intervalSetting);
        logging("Settings applied", $logTextArea);

        // Brief visual feedback on the button
        $applyButton.textContent = "APPLIED ✓";
        setTimeout(() => { $applyButton.textContent = "APPLY"; }, 1500);
    });

    // ── Clear log ─────────────────────────────────────────────────────
    $clearButton.addEventListener("click", () => {
        $logTextArea.value = "";
        chrome.storage.local.set({ localSavedLog: "" });
    });

    // ── Restore persisted state ───────────────────────────────────────
    chrome.storage.local.get(['paused', 'sec', 'running', 'localSavedLog', 'theme'], result => {
        // Theme
        const savedTheme = result.theme || "dark";
        document.documentElement.setAttribute("data-theme", savedTheme);

        // Settings
        $pausedSetting.checked  = !!result.paused;
        $intervalSetting.value  = result.sec || DEFAULT_CHECK_TIME;
        $startSwitch.checked    = !!result.running;

        // Power UI
        updatePowerUI(!!result.running);

        // Log
        $logTextArea.value = result.localSavedLog || "";
        $logTextArea.scrollTop = $logTextArea.scrollHeight;
    });

    // ── Feedback form ─────────────────────────────────────────────────
    const feedbackForm = document.getElementById("feedback-form");
    const isEmailJSConfigured = PKEY && PKEY !== "YOUR_PUBLIC_KEY"
                             && SID  && SID  !== "YOUR_SERVICE_ID"
                             && TID  && TID  !== "YOUR_TEMPLATE_ID";

    if (isEmailJSConfigured) {
        emailjs.init(PKEY);
    } else {
        // Show a one-time setup hint in the feedback section
        $feedbackMessage.textContent = "Feedback requires EmailJS — add your keys to src/js/config.js.";
        $feedbackMessage.className = "feedback-msg";
        $feedbackMessage.style.display = "block";
    }

    feedbackForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const feedbackText = document.getElementById("feedback").value.trim();
        if (!feedbackText) return;

        if (!isEmailJSConfigured) {
            $feedbackMessage.textContent = "EmailJS not configured. Edit src/js/config.js with your keys.";
            $feedbackMessage.className = "feedback-msg error";
            $feedbackMessage.style.display = "block";
            return;
        }

        emailjs.send(SID, TID, {
                name:    "Revume User",
                time:    new Date().toLocaleString(),
                message: feedbackText,
            })
            .then(function (response) {
                console.log("Feedback sent!", response);
                $feedbackMessage.textContent = "Thank you for your feedback! ❤️";
                $feedbackMessage.className = "feedback-msg success";
                $feedbackMessage.style.display = "";
            }, function (error) {
                console.error("Failed to send feedback:", error);
                $feedbackMessage.textContent = "Failed to send. Check your EmailJS keys and template.";
                $feedbackMessage.className = "feedback-msg error";
                $feedbackMessage.style.display = "";
            });

        document.getElementById("feedback").value = "";
    });
};
