var utoken = undefined;

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

function unlogin() {
    setCookie("utoken", undefined);
    location.reload();
}

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

    fetch(`/api/v1/like?id=${getMessage(element).dataset.id}&utoken=${utoken}`, {
        method: "PATCH"
    });
    const count = element.querySelector('[name=like-count]');
    count.textContent = parseInt(count.textContent) + 1;
    like_nodata(element);
}

function like_nodata(element) {
    if (!utoken) {
        createAndShowWindow(loginWindow);
        return;
    }

    element.dataset.liked = "true";
    element.querySelector('[name=like-icon]').classList.remove('nf-cod-heart');
    element.querySelector('[name=like-icon]').classList.add('nf-cod-heart_filled');
}

function unlike(element) {
    if (!utoken) {
        createAndShowWindow(loginWindow);
        return;
    }

    fetch(`/api/v1/unlike?id=${getMessage(element).dataset.id}&utoken=${utoken}`, {
        method: "PATCH"
    });

    element.dataset.liked = "false";
    const count = element.querySelector('[name=like-count]');
    count.textContent = parseInt(count.textContent) - 1;
    element.querySelector('[name=like-icon]').classList.remove('nf-cod-heart_filled');
    element.querySelector('[name=like-icon]').classList.add('nf-cod-heart');
}

function publish() {
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
    
    if (anonymous) {
        fetch(`/api/v1/messages?user=ANONYMOUS&content=${content}`, {
            method: "POST"
        });
    } else {
        fetch(`/api/v1/messages?user=${utoken}&content=${content}`, {
            method: "POST"
        });
    }

    document.getElementById("content").value = "";
}

function getMessage(child) {
    return child.closest(".message");
}

async function login(wnd) {
    const username = wnd.querySelector("[name=login-username]").value;
    if (!username) {
        createToast("登录失败：用户名为空", 3);
        return;
    }
    const password = wnd.querySelector("[name=login-password]").value;
    if (!password) {
        createToast("登录失败：密码为空", 3);
        return;
    }

    var response = await fetch(`/api/v1/login?username=${username}&password=${password}`, {
        method: "GET"
    });

    switch (response.status) {
        case 480: // User Not Found
            createToast("登录失败：找不到用户", 3);
            break;
        case 481: // Incorrect Password
            createToast("登录失败：密码错误", 3);
            break;
        case 200: // Ok
            createToast("登录成功！", 1);
            
            setCookie("utoken", (await response.json()).utoken);
            
            await sleep(1000);
            location.reload();
            break;
    }
}


async function register(wnd) {
    const username = wnd.querySelector("[name=register-username]").value;
    if (!username) {
        createToast("注册失败：用户名为空", 3);
        return;
    }
    const password = wnd.querySelector("[name=register-password]").value;
    if (!password) {
        createToast("注册失败：密码为空", 3);
        return;
    }
    const confirmPassword = wnd.querySelector("[name=register-confirm-password]").value;
    if (password != confirmPassword) {
        createToast("注册失败：确认密码与密码不匹配", 3);
        return;
    }

    var response = await fetch(`/api/v1/register?username=${username}&password=${password}`, {
        method: "POST"
    });

    switch (response.status) {
        case 480: // Usename Already Exists
            createToast("注册失败：用户名已被注册", 3);
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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const loginWindow = "login-window-template";
const registerWindow = "register-window-template";

// Window Manager

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

const storedUsernames = {};

async function init() {
    let response = await fetch("/api/v1/messages?limit=20&offset=0", {
        method: "GET"
    });

    const json = await response.json();
    const messageTemplate = document.getElementById("message-template");
    const messageContainer = document.getElementById("message-container");

    let i = 0;

    for (const element of json.messages) {
        const cloned = document.importNode(messageTemplate.content, true);
        const div = cloned.querySelector(".message");

        if (element.user === "ANONYMOUS") {
            cloned.querySelector("[name=user]").textContent = storedUsernames[element.user] = "匿名用户";
        }

        if (element.user in storedUsernames) {
            cloned.querySelector("[name=user]").textContent = storedUsernames[element.user];
        } else {
            response = await fetch(`/api/v1/username?id=${element.user}`, {
                method: "GET"
            });
            if (response.ok) {
                cloned.querySelector("[name=user]").textContent = storedUsernames[element.user] = (await response.json()).name;
            }
        }
        cloned.querySelector("[name=time]").textContent = element.created_at;
        cloned.querySelector("[name=content]").textContent = element.content;
        cloned.querySelector("[name=like-count]").textContent = element.likes;

        if (i % 2 == 1) {
            cloned.querySelectorAll(".fore-button").forEach(element => {
                element.style.setProperty("--color-hover", "var(--color-light)");
            });

            div.style.setProperty("background-color", "color-mix(in srgb, var(--color-main), transparent 50%)");
        }
        div.dataset.id = element.id;

        messageContainer.appendChild(cloned);

        i++;
    }

    var unlogged = document.getElementById("unlogged")
    var logged = document.getElementById("logged")

    utoken = getCookie("utoken");
    if (!utoken) {
        unlogged.style.removeProperty("display");
        logged.style.setProperty("display", "none");
    } else {
        logged.style.removeProperty("display");
        unlogged.style.setProperty("display", "none");

        var logged_username = document.getElementById("logged-username");

        if (utoken in storedUsernames) {
            logged_username.textContent = storedUsernames[utoken];
        } else {
            response = await fetch(`/api/v1/username?id=${utoken}`, {
                method: "GET"
            });
            if (!response.ok) {
                setCookie("utoken", undefined);
                location.reload();
                return;
            }
            logged_username.textContent = storedUsernames[utoken] = (await response.json()).name;
        }

        //

        response = await fetch(`/api/v1/user_liked_messages?utoken=${utoken}&message_id_min=0&message_id_max=20`, {
            method: "GET"
        });

        const json = await response.json();

        json.messages.forEach(element => {
            var id = element.message_id;

            var elem = messageContainer.querySelector(`[data-id="${id}"]`);
            like_nodata(elem.querySelector("[name=like]"));
        });
    }
}

function createToast(content, duration) {
    const toastContainer = document.getElementById("toast-container");
    const toastTemplate = document.getElementById("toast-template");

    const cloned = document.importNode(toastTemplate.content, true);
    const toast = cloned.querySelector(".toast");

    toast.style.setProperty("animation", "toast-in 0.25s ease-out forwards");

    toast.querySelector("[name=text]").textContent = content;
    const progressBar = toast.querySelector("[name=progress-bar]");

    progressBar.style.setProperty("animation", `toast-progress-bar-finishing ${duration}s linear forwards`);

    function progressEnd() {
        progressBar.removeEventListener("animationend", progressEnd);

        toast.style.setProperty("animation", "toast-out 0.25s ease-in forwards");
        toast.addEventListener("animationend", animationEnd);
    }

    function animationEnd() {
        toastContainer.removeChild(toast);
    }

    progressBar.addEventListener("animationend", progressEnd);
    toastContainer.appendChild(cloned);
}
