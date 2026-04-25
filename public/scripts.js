var utoken = undefined;

// #region Cookie

function setCookie(name, value) {
    if (value)
        document.cookie = `${name}=${value};expires=${new Date(9999, 11, 31, 23, 59, 59)}`
    else
        document.cookie = `${name}=undefined;expires=${new Date(0, 0, 1, 0, 0, 0)}`
}

function getCookie(name) {
    var arr, reg = new RegExp(`(^| )${name}=([^;]*)(;|$)`)
    if (arr = document.cookie.match(reg))
        return arr[2];
    return null;
}

// #endregion

// #region User Manager

async function setLoginDisplay(refreshLiked = false)
{
    const messageContainer = document.getElementById("message-container");
    const unlogged = document.getElementById("unlogged");
    const logged = document.getElementById("logged");

    if (utoken) {
        const response = await fetch("/api/v1/validate_token", {
            method: "POST",
            body: JSON.stringify({
                utoken
            })
        });
        const json = await response.json();
        if (!json.valid) {
            createToast("登录状态已过期，请重新登录", 3);
            setCookie("utoken", undefined);
            utoken = null;
            setLoginDisplay(refreshLiked);
            return;
        }

        unlogged.style.setProperty("display", "none");
        logged.style.removeProperty("display");

        var loggedUsername = document.getElementById("logged-username");
        loggedUsername.textContent = await getUsername(utoken);

        if (refreshLiked) {
            const response = await fetch("/api/v1/messages", {
                method: "POST",
                body: JSON.stringify({
                    limit: 20,
                    offset: 0,
                    utoken
                })
            });

            const json = await response.json();

            const messageContainer = document.getElementById("message-container");
            for (const element of json.messages) {
                if (element.liked_by_user) {
                    like_nodata(messageContainer.querySelector(`[data-id="${element.uuid}"] [name=like]`));
                }
            }
        }
    }
    else {
        unlogged.style.removeProperty("display");
        logged.style.setProperty("display", "none");

        messageContainer.querySelectorAll(".message").forEach(element => {
            unlike_nodata(element.querySelector("[name=like]"));
        });
    }
}

async function unlogin() {
    await fetch("/api/v1/unlogin", {
        method: "POST",
        body: JSON.stringify({
            utoken
        })
    });

    setCookie("utoken", undefined);
    utoken = null;
    
    await setLoginDisplay();
    createToast("已退出登录！", 3);
}

async function login(wnd) {
    const username = wnd.querySelector("[name=login-username]").value;

    if (!username) {
        createToast("登录失败：用户名为空", 3, true);
        return;
    }
    const password = wnd.querySelector("[name=login-password]").value;
    if (!password) {
        createToast("登录失败：密码为空", 3, true);
        return;
    }

    var response = await fetch("/api/v1/login", {
        method: "POST",
        body: JSON.stringify({
            username,
            password
        })
    });

    switch (response.status) {
        case 480: // User Not Found
            createToast("登录失败：找不到用户", 3, true);
            break;
        case 481: // Incorrect Password
            createToast("登录失败：密码错误", 3, true);
            break;
        case 200: // Ok
            hideAndDestroyWindow(wnd);
            
            utoken = (await response.json()).utoken;
            setCookie("utoken", utoken);
            
            await setLoginDisplay(true);

            createToast("登录成功！", 3);

            break;
    }
}

async function getUsername(uuid) {
    if (uuid in storedUsernames) {
        return storedUsernames[uuid];
    } else {
        response = await fetch("/api/v1/username", {
            method: "POST",
            body: JSON.stringify({
                uuid
            })
        });
        return storedUsernames[uuid] = (await response.json()).name;
    }
}

async function loadUserLikes() {
    const messageContainer = document.getElementById("message-container");
    
    response = await fetch("/api/v1/user_liked_messages", {
        method: "POST",
        body: JSON.stringify({
            utoken,
            offset: 0,
            limit: 20
        })
    });

    const json = await response.json();

    json.messages.forEach(element => {
        var id = element.message_id;

        var elem = messageContainer.querySelector(`[data-id="${id}"]`);
        like_nodata(elem.querySelector("[name=like]"));
    });
}

async function register(wnd) {
    const username = wnd.querySelector("[name=register-username]").value;
    if (!username) {
        createToast("注册失败：用户名为空", 3, true);
        return;
    }
    if (username === "ANONYMOUS") {
        createToast("你……你要干什么！", 3, true);
        return;
    }
    const password = wnd.querySelector("[name=register-password]").value;
    if (!password) {
        createToast("注册失败：密码为空", 3, true);
        return;
    }
    const confirmPassword = wnd.querySelector("[name=register-confirm-password]").value;
    if (password != confirmPassword) {
        createToast("注册失败：确认密码与密码不匹配", 3, true);
        return;
    }

    var response = await fetch("/api/v1/register", {
        method: "PATCH",
        body: JSON.stringify({
            username,
            password
        })
    });

    switch (response.status) {
        case 480: // Usename Already Exists
            createToast("注册失败：用户名已被注册", 3, true);
            break;
        case 200: // Ok
            createToast("注册成功！", 1);
            
            await sleep(1000);
            
            if (!windows.includes(loginWindow))
                createAndShowWindow(loginWindow);
            hideAndDestroyWindow(wnd);
            break;
    }
}

// #endregion

// #region Like Management

function toggleLike(element) {
    if (!utoken) {
        createAndShowWindow(loginWindow);
        return;
    }

    if (element.dataset.liked === "true")
        unlike(element);
    else
        like(element);
}

function like(element) {
    if (!utoken) {
        createAndShowWindow(loginWindow);
        return;
    }

    fetch("/api/v1/like", {
        method: "PATCH",
        body: JSON.stringify({
            uuid: getMessage(element).dataset.id,
            utoken: utoken
        })
    });
    const count = element.querySelector("[name=like-count]");
    count.textContent = parseInt(count.textContent) + 1;
    like_nodata(element);
}

const nf_cod_heart = "\ueb05";
const nf_cod_heart_filled = "\uec04";

function like_nodata(element) {
    element.dataset.liked = "true";
    element.querySelector("[name=like-icon]").textContent = nf_cod_heart_filled;
}

function unlike_nodata(element) {
    element.dataset.liked = "false";
    element.querySelector("[name=like-icon]").textContent = nf_cod_heart;
}

function unlike(element) {
    if (!utoken) {
        createAndShowWindow(loginWindow);
        return;
    }

    fetch("/api/v1/unlike", {
        method: "PATCH",
        body: JSON.stringify({
            uuid: getMessage(element).dataset.id,
            utoken
        })
    });

    const count = element.querySelector("[name=like-count]");
    count.textContent = parseInt(count.textContent) - 1;
    unlike_nodata(element);
}

// #endregion

async function publish() {
    if (!utoken) {
        createAndShowWindow(loginWindow);
        return;
    }

    const content = document.getElementById("content").value;
    if (!content) {
        createToast("发布内容不能为空", 3);
        return;
    }

    const anonymous = document.getElementById("anonymous").checked;
    
    const result = await fetch("/api/v1/messages", {
        method: "PATCH",
        body: JSON.stringify({
            utoken,
            content,
            anonymous
        })
    });

    const json = await result.json();
    if (json.messages === "Success") {
        createToast("发布成功！", 3);
        
        insertMessage(json.uuid, content, anonymous ? "ANONYMOUS" : utoken, new Date(), 0);
    }

    document.getElementById("content").value = "";
}

function getMessage(child) {
    return child.closest(".message");
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const loginWindow = "login-window-template";
const registerWindow = "register-window-template";

// #region Window Manager

const windows = [];
const windowInstances = [];

function getWindow(child) {
    return child.closest(".window");
}

function getWindowContent(wnd) {
    return wnd.querySelector(".window-content");
}

function showWindow(wnd) {
    const content = getWindowContent(wnd);

    content.style.setProperty("animation", "window-show 0.25s ease-out forwards");
    wnd.style.setProperty("animation", "window-backdrop-show 0.25s ease-out forwards");
    wnd.style.removeProperty("display");

    function animationEnd() {
        content.style.removeProperty("animation");
        wnd.style.removeProperty("animation");
        wnd.style.removeProperty("pointer-events");
        content.removeEventListener("animationend", animationEnd);
    }

    content.addEventListener("animationend", animationEnd);
}

function hideWindow(wnd) {
    const content = getWindowContent(wnd);

    content.style.setProperty("animation", "window-hide 5s ease-out forwards");
    wnd.style.setProperty("animation", "window-backdrop-hide 5s ease-out forwards");
    wnd.style.setProperty("pointer-events", "none");

    function animationEnd() {
        content.style.removeProperty("animation");
        wnd.style.removeProperty("animation");
        wnd.style.setProperty("display", "none");
        content.removeEventListener("animationend", animationEnd);
    }

    content.addEventListener("animationend", animationEnd);
}

function createAndShowWindow(windowTemplate) {
    const windowContainer = document.getElementById("window-container");

    let index = 0;
    if ((index = windows.indexOf(windowTemplate)) !== -1) {
        windowContainer.appendChild(windowInstances[index]);
        return;
    }

    const cloned = document.importNode(document.getElementById(windowTemplate).content, true);
    const wnd = cloned.querySelector(".window");
    const content = getWindowContent(wnd);

    content.style.setProperty("animation", "window-show 0.25s ease-out forwards");
    wnd.style.setProperty("animation", "window-backdrop-show 0.25s ease-out forwards");
    wnd.style.removeProperty("display");

    function animationEnd() {
        content.style.removeProperty("animation");
        wnd.style.removeProperty("animation");
        wnd.style.removeProperty("pointer-events");
        content.removeEventListener("animationend", animationEnd);
    }

    content.addEventListener("animationend", animationEnd);
    windowContainer.appendChild(cloned);

    wnd.dataset.windowIndex = windows.length;
    windows.push(windowTemplate);
    windowInstances.push(wnd);
}

function hideAndDestroyWindow(wnd) {
    const windowContainer = document.getElementById("window-container");

    const content = getWindowContent(wnd);

    content.style.setProperty("animation", "window-hide 0.25s ease-out forwards");
    wnd.style.setProperty("animation", "window-backdrop-hide 0.25s ease-out forwards");
    wnd.style.setProperty("pointer-events", "none");

    function animationEnd() {
        content.style.removeProperty("animation");
        wnd.style.removeProperty("animation");
        wnd.style.setProperty("display", "none");
        content.removeEventListener("animationend", animationEnd);

        windowContainer.removeChild(wnd);

        windows.splice(wnd.dataset.windowIndex, 1);
        windowInstances.splice(wnd.dataset.windowIndex, 1);
        for (var i = wnd.dataset.windowIndex; i < windows.length; i++) {
            windowInstances[i].dataset.windowIndex--;
        }
    }

    content.addEventListener("animationend", animationEnd);
}

// #endregion

const storedUsernames = {};

// #region Utils

function convertTime(timeStr) {
    var time = new Date(timeStr + 'Z');
    var now = new Date();
    
    var diff = Math.floor((now - time) / 1000);

    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}天前`;
    return time.toLocaleString();
}

//#endregion

let observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !busy) {
            loadMessage();
        }
    });
}, {
    threshold: 0.5
});

async function init() {
    utoken = getCookie("utoken");
    await setLoginDisplay(false);
    const element = document.querySelector('.loading');
    observer.observe(element);
}

let i = 0;
let loaded = 0;
const step = 20;
let busy = false; 

async function loadMessage() {
    let response;
    if (utoken) {
        response = await fetch("/api/v1/messages", {
            method: "POST",
            body: JSON.stringify({
                limit: step,
                offset: loaded,
                utoken
            })
        });
    }
    else {
        response = await fetch("/api/v1/messages", {
            method: "POST",
            body: JSON.stringify({
                limit: step,
                offset: loaded,
                utoken: null
            })
        });
    }
    busy = true;
    const json = await response.json();
    for (const element of json.messages) {
        await createMessage(element.uuid, element.content, element.user, element.created_at, element.likes);
    }
    busy = false;

    if (utoken) {
        const messageContainer = document.getElementById("message-container");
        for (const element of json.messages) {
            if (element.liked_by_user) {
                like_nodata(messageContainer.querySelector(`[data-id="${element.uuid}"] [name=like]`));
            }
        }
    }

    if (!json.hasMore) {
        const loading = document.querySelector('.loading');
        observer.unobserve(loading);
        loading.textContent = "没有更多了";
        loading.style.setProperty("animation", "none");
    }
    loaded += step;

    MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
}

async function createMessage(uuid, content, sender, created_at, likes) {
    const messageTemplate = document.getElementById("message-template");
    const messageContainer = document.getElementById("message-container");

    const cloned = document.importNode(messageTemplate.content, true);
    const div = cloned.querySelector(".message");

    if (sender === "ANONYMOUS") {
        cloned.querySelector("[name=user]").textContent = storedUsernames[sender] = "匿名用户";
    }

    if (sender in storedUsernames) {
        cloned.querySelector("[name=user]").textContent = storedUsernames[sender];
    } else {
        var username = await getUsername(sender);

        if (response.ok) {
            cloned.querySelector("[name=user]").textContent = storedUsernames[sender] = username;
        }
    }
    cloned.querySelector("[name=time]").textContent = convertTime(created_at);
    cloned.querySelector("[name=content]").innerHTML = content;
    cloned.querySelector("[name=like-count]").textContent = likes;

    if (i % 2 == 1) {
        div.classList.add("light");
    }
    div.dataset.id = uuid;

    messageContainer.insertBefore(cloned, messageContainer.querySelector(".loading"));

    i++;
}

async function insertMessage(uuid, content, sender, createdAt, likes) {
    const messageTemplate = document.getElementById("message-template");
    const messageContainer = document.getElementById("message-container");

    const cloned = document.importNode(messageTemplate.content, true);
    const div = cloned.querySelector(".message");

    if (sender === "ANONYMOUS") {
        cloned.querySelector("[name=user]").textContent = storedUsernames[sender] = "匿名用户";
    }

    if (sender in storedUsernames) {
        cloned.querySelector("[name=user]").textContent = storedUsernames[sender];
    } else {
        var username = await getUsername(sender);

        if (response.ok) {
            cloned.querySelector("[name=user]").textContent = storedUsernames[sender] = username;
        }
    }
    cloned.querySelector("[name=time]").textContent = convertTime(createdAt);
    cloned.querySelector("[name=content]").innerHTML = content;
    cloned.querySelector("[name=like-count]").textContent = likes;

    div.dataset.id = uuid;

    for (const element of messageContainer.querySelectorAll(".message")) {
        element.classList.toggle("light");
    }

    messageContainer.insertBefore(cloned, messageContainer.firstChild);
}

function createToast(content, duration, isError = false) {
    const toastContainer = document.getElementById("toast-container");
    const toastTemplate = document.getElementById("toast-template");

    const cloned = document.importNode(toastTemplate.content, true);
    const toast = cloned.querySelector(".toast");

    toast.style.setProperty("animation", "toast-in 0.25s ease-out forwards");

    toast.querySelector("[name=text]").textContent = content;
    if (isError) {
        toast.querySelector("[name=icon]").textContent = "\uea87";
    }

    const progressBar = toast.querySelector("[name=progress-bar]");

    progressBar.style.setProperty("animation", `toast-progress-bar-finishing ${duration}s linear forwards`);

    progressBar.addEventListener("animationend", progressEnd);

    toastContainer.appendChild(cloned);

    function progressEnd() {
        progressBar.removeEventListener("animationend", progressEnd);

        toast.style.setProperty("animation", "toast-out 0.25s ease-in forwards");
    
        toast.addEventListener("animationstart", outAnimationStart);
    }

    function outAnimationStart() {
        toast.removeEventListener("animationstart", outAnimationStart);
        toast.addEventListener("animationend", outAnimationEnd);
    }

    function outAnimationEnd() {
        toastContainer.removeChild(toast);
    }
}
