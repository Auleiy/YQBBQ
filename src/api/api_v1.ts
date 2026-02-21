const respHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
}
const respHeadersPlaintext = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "plaintext"
}

export default {
    async messages(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const rawBody = await request.json();

        if (!rawBody) {
            return new Response(JSON.stringify({
                error: "Bad Request",
                message: "body is null."
            }), {
                status: 400,
                headers: respHeaders
            });
        }

        console.log(rawBody);
        switch (request.method) {
            case "POST":
                try {
                    const body = rawBody as {
                        limit: number,
                        offset: number
                    };

                    const limit = Math.min(body.limit || 20, 60);
                    const offset = body.offset || 0;

                    var { results } = await env.DB.prepare(
                        "select * from Messages order by created_at desc limit ? offset ?"
                    )
                    .bind(limit, offset)
                    .all();

                    const { count } = await env.DB.prepare("select count(*) as count from Messages").first() as { count: number };

                    return new Response(JSON.stringify({
                        messages: results,
                        hasMore: offset + results.length < count
                    }), {
                        status: 200,
                        headers: respHeaders
                    });
                } catch (err: any) {
                    return new Response(JSON.stringify({
                        error: "Internal Server Error",
                        message: err.message
                    }), {
                        status: 500,
                        headers: respHeaders
                    });
                }
            
            case "PATCH":
                try {
                    const body = rawBody as {
                        content: string,
                        utoken: string,
                        anonymous: boolean
                    };

                    const content = body.content;
                    if (!content) {
                        return new Response(JSON.stringify({
                            error: "Bad Request",
                            message: "content is missing."
                        }), {
                            status: 400,
                            headers: respHeaders
                        });
                    }

                    let user = "ANONYMOUS";

                    if (!body.anonymous) {
                        user = body.utoken || "ANONYMOUS";
                    }

                    await env.DB.prepare("insert into Messages (content, user) values (?, ?)")
                        .bind(content, user)
                        .run();

                    return new Response(JSON.stringify({
                        messages: "Success"
                    }), {
                        status: 200,
                        headers: respHeaders
                    });
                } catch (err: any) {
                    return new Response(JSON.stringify({
                        error: "Internal Server Error",
                        message: err.message
                    }), {
                        status: 500,
                        headers : respHeaders
                    });
                }

            case "DELETE":
                return new Response(JSON.stringify(
                    {
                        error: "Method Not Implemented", 
                        message: request.method + " is not implemented."
                    }), {
                        status: 501,
                        headers : respHeaders
                    });

            default:
                return new Response(JSON.stringify(
                    {
                        error: "Method Not Allowed", 
                        message: request.method + " is not allowed."
                    }), {
                        status: 405,
                        headers : {
                            ...respHeaders,
                            "Allow": "POST, PATCH, DELETE"
                        }
                    });
        }
    },

    async like_count(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const rawBody = await request.json();

        if (!rawBody) {
            return new Response(JSON.stringify({
                error: "Bad Request",
                message: "body is null."
            }), {
                status: 400,
                headers: respHeaders
            });
        }

        switch (request.method) {
            case "POST":
                try {
                    const body = rawBody as {
                        id: number
                    };

                    const id = body.id;
                    if (!id) {
                        return new Response(JSON.stringify({
                            error: "Bad Request",
                            message: "id is missing."
                        }), {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const likesObj = await env.DB.prepare(
                        "select likes from Messages where id = ?"
                    )
                    .bind(id)
                    .first();

                    if (!likesObj) {
                        return new Response(JSON.stringify({
                            message: "Message not found."
                        }), {
                            status: 420,
                            headers : respHeaders
                        });
                    }
                    return new Response(JSON.stringify({
                        count: (likesObj as { likes: number }).likes
                    }), {
                        status: 200,
                        headers: respHeaders
                    });
                }
                catch (err: any) {
                    return new Response(JSON.stringify({
                        error: "Internal Server Error",
                        message: err.toString()
                    }), {
                        status: 500,
                        headers: respHeaders
                    });
                }
            
            default:
                return new Response(JSON.stringify(
                    {
                        error: "Method Not Allowed", 
                        message: request.method + " is not allowed."
                    }), {
                        status: 405,
                        headers : {
                            ...respHeaders,
                            "Allow": "POST"
                        }
                    });
        }
    },

    async user_liked_messages(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const rawBody = await request.json();

        if (!rawBody) {
            return new Response(JSON.stringify({
                error: "Bad Request",
                message: "body is null."
            }), {
                status: 400,
                headers: respHeaders
            });
        }

        switch (request.method) {
            case "POST":
                try {
                    const body = rawBody as {
                        utoken: string,
                        msgidMin: number
                        msgidMax: number
                    };

                    const utoken = body.utoken;
                    if (!utoken) {
                        return new Response(JSON.stringify({
                            error: "Bad Request",
                            message: "utoken is missing."
                        }), {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const msgid_min = body.msgidMin || 0;
                    const msgid_max = body.msgidMax || 20;

                    const likedMsgs = (await env.DB.prepare(
                        "select message_id from Likes where user_id = ? and message_id between ? and ?"
                    )
                    .bind(utoken, msgid_min, msgid_max)
                    .all()).results;

                    if (!likedMsgs) {
                        return new Response(JSON.stringify({
                            message: "User not found."
                        }), {
                            status: 420,
                            headers : respHeaders
                        });
                    }
                    return new Response(JSON.stringify({
                        messages: likedMsgs
                    }), {
                        status: 200,
                        headers: respHeaders
                    });
                }
                catch (err: any) {
                    return new Response(JSON.stringify({
                        error: "Internal Server Error",
                        message: err.toString()
                    }), {
                        status: 500,
                        headers: respHeaders
                    });
                }
            
            default:
                return new Response(JSON.stringify(
                    {
                        error: "Method Not Allowed", 
                        message: request.method + " is not allowed."
                    }), {
                        status: 405,
                        headers : {
                            ...respHeaders,
                            "Allow": "POST"
                        }
                    });
        }
    },

    async like(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const rawBody = await request.json();

        if (!rawBody) {
            return new Response(JSON.stringify({
                error: "Bad Request",
                message: "body is null."
            }), {
                status: 400,
                headers: respHeaders
            });
        }

        switch (request.method) {
            case "PATCH":
                try {
                    const body = rawBody as {
                        id: number,
                        utoken: string
                    };

                    const id = body.id;
                    if (!id) {
                        return new Response(JSON.stringify({
                            error: "Bad Request",
                            message: "id is missing."
                        }), {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const utoken = body.utoken;
                    if (!utoken) {
                        return new Response(JSON.stringify({
                            error: "Bad Request",
                            message: "utoken is missing."
                        }), {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    await env.DB.prepare(
                        "INSERT INTO Likes (user_id, message_id) VALUES (?, ?);"
                    )
                    .bind(utoken, id)
                    .run();

                    return new Response(null, {
                        status: 200,
                        headers: respHeaders
                    });
                } catch (err: any) {
                    return new Response(JSON.stringify({
                        error: "Internal Server Error",
                        message: err.message
                    }), {
                        status: 500,
                        headers: respHeaders
                    });
                }

            default:
                return new Response(JSON.stringify(
                    {
                        error: "Method Not Allowed", 
                        message: request.method + " is not allowed."
                    }), {
                        status: 405,
                        headers: {
                            ...respHeaders,
                            "Allow": "PATCH"
                        }
                    });
        }
    },

    async unlike(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const rawBody = await request.json();

        if (!rawBody) {
            return new Response(JSON.stringify({
                error: "Bad Request",
                message: "body is null."
            }), {
                status: 400,
                headers: respHeaders
            });
        }

        switch (request.method) {
            case "PATCH":
                try {
                    const body = rawBody as {
                        id: number,
                        utoken: string
                    };

                    const id = body.id;
                    if (!id) {
                        return new Response(JSON.stringify({
                            error: "Bad Request",
                            message: "id is missing."
                        }), {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const utoken = body.utoken;
                    if (!utoken) {
                        return new Response(JSON.stringify({
                            error: "Bad Request",
                            message: "utoken is missing."
                        }), {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    await env.DB.prepare(
                        "DELETE FROM Likes WHERE user_id = ? AND message_id = ?;"
                    )
                    .bind(utoken, id)
                    .run();

                    return new Response(null, {
                        status: 200,
                        headers: respHeaders
                    });
                } catch (err: any) {
                    return new Response(JSON.stringify({
                        error: "Internal Server Error",
                        message: err.message
                    }), {
                        status: 500,
                        headers: respHeaders
                    });
                }

            default:
                return new Response(JSON.stringify(
                    {
                        error: "Method Not Allowed", 
                        message: request.method + " is not allowed."
                    }), {
                        status: 405,
                        headers: {
                            ...respHeaders,
                            "Allow": "PATCH"
                        }
                    });
        }
    },

    async username(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const rawBody = await request.json();

        if (!rawBody) {
            return new Response(JSON.stringify({
                error: "Bad Request",
                message: "body is null."
            }), {
                status: 400,
                headers: respHeaders
            });
        }
        
        switch (request.method) {
            case "POST":
                try {
                    const body = rawBody as {
                        utoken: number,
                    };

                    const utoken = body.utoken;
                    if (!utoken) {
                        return new Response(JSON.stringify({
                            error: "Bad Request",
                            message: "utoken is missing."
                        }), {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const { name } = await env.DB.prepare(
                        "select name from Users where id = ?"
                    )
                    .bind(utoken)
                    .first() as { name: string };

                    if (!name) {
                        return new Response(JSON.stringify({
                            message: "User not found."
                        }), {
                            status: 420,
                            headers: respHeaders
                        });
                    }

                    return new Response(JSON.stringify({
                        name: name
                    }), {
                        status: 200,
                        headers: respHeaders
                    });
                } catch (err: any) {
                    return new Response(JSON.stringify({
                        error: "Internal Server Error",
                        message: err.message
                    }), {
                        status: 500,
                        headers: respHeaders
                    });
                }

            default:
                return new Response(JSON.stringify(
                    {
                        error: "Method Not Allowed", 
                        message: request.method + " is not allowed."
                    }), {
                        status: 405,
                        headers: {
                            ...respHeaders,
                            "Allow": "POST"
                        }
                    });
        }
    },

    async login(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const rawBody = await request.json();

        if (!rawBody) {
            return new Response(JSON.stringify({
                error: "Bad Request",
                message: "body is null."
            }), {
                status: 400,
                headers: respHeaders
            });
        }

        switch (request.method) {
            case "POST":
                try {
                    const body = rawBody as {
                        username: string,
                        password: string
                    }

                    const inputUsername = body.username;
                    if (!inputUsername) {
                        return new Response(JSON.stringify({
                            error: "Bad Request",
                            message: "username is missing."
                        }), {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const inputPassword = body.password;
                    if (!inputPassword) {
                        return new Response(JSON.stringify({
                            error: "Bad Request",
                            message: "password is missing."
                        }), {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const user = (await env.DB.prepare(
                        "select id, password from Users where name = ?"
                    )
                    .bind(inputUsername)
                    .first()) as { id: string, password: string };

                    if (!user) {
                        return new Response("User Not Found", {
                            status: 480,
                            headers: respHeaders
                        });
                    }

                    const passwordHash = await hash(inputPassword);
                    if (passwordHash !== user.password) {
                        return new Response("Incorrect Password", {
                            status: 481,
                            headers: respHeadersPlaintext
                        });
                    }
                    
                    return new Response(JSON.stringify({
                        utoken: user.id
                    }), {
                        status: 200,
                        headers: respHeaders
                    });
                }
                catch (err: any) {
                    return new Response(JSON.stringify({
                        error: "Internal Server Error",
                        message: err.toString()
                    }), {
                        status: 500,
                        headers: respHeaders
                    });
                }
            
            default:
                return new Response(JSON.stringify(
                    {
                        error: "Method Not Allowed", 
                        message: request.method + " is not allowed."
                    }), {
                        status: 405,
                        headers : {
                            ...respHeaders,
                            "Allow": "POST"
                        }
                    });
        }
    },

    async register(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const rawBody = await request.json();

        if (!rawBody) {
            return new Response(JSON.stringify({
                error: "Bad Request",
                message: "body is null."
            }), {
                status: 400,
                headers: respHeaders
            });
        }

        switch (request.method) {
            case "PATCH":
                try {
                    const body = rawBody as {
                        username: string,
                        password: string
                    }

                    const inputUsername = body.username;
                    if (!inputUsername) {
                        return new Response(JSON.stringify({
                            error: "Bad Request",
                            message: "username is missing."
                        }), {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const existence = (await env.DB.prepare(
                        "select * from Users where name = ?"
                    )
                    .bind(inputUsername)
                    .first());

                    if (existence) {
                        return new Response(JSON.stringify({
                            error: "Username Already Exists",
                        }), {
                            status: 480
                        });
                    }

                    const inputPassword = body.password;
                    if (!inputPassword) {
                        return new Response(JSON.stringify({
                            error: "Bad Request",
                            message: "password is missing."
                        }), {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const passwordHash = await hash(inputPassword);

                    const uuid = crypto.randomUUID();

                    await env.DB.prepare(
                        "insert into Users (id, name, password) values (?, ?, ?)"
                    )
                    .bind(uuid, inputUsername, passwordHash)
                    .run();
                    
                    return new Response("Ok", {
                        status: 200,
                        headers: respHeaders
                    });
                }
                catch (err: any) {
                    return new Response(JSON.stringify({
                        error: "Internal Server Error",
                        message: err.toString()
                    }), {
                        status: 500,
                        headers: respHeaders
                    });
                }
            
            default:
                return new Response(JSON.stringify(
                    {
                        error: "Method Not Allowed", 
                        message: request.method + " is not allowed."
                    }), {
                        status: 405,
                        headers : {
                            ...respHeaders,
                            "Allow": "PATCH"
                        }
                    });
        }
    }
}

async function hash(message: string) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-512', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.toUpperCase();
}