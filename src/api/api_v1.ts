const respHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
}
const respHeadersPlaintext = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "plaintext"
}

let keepingUserTokens: Map<string, string> = new Map();

export default {
    async messages(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const rawBody = await request.json();

        if (!rawBody) {
            return Response.json({
                error: "Bad Request",
                message: "body is null."
            }, {
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
                        offset: number,
                        utoken: string | undefined | null
                    };

                    const limit = Math.min(body.limit || 20, 60);
                    const offset = body.offset || 0;
                    const { count } = await env.DB.prepare("select count(*) as count from Messages").first() as { count: number };

                    if (!body.utoken) {

                        var { results } = await env.DB.prepare(
                            "select * from Messages order by created_at desc limit ? offset ?"
                        )
                            .bind(limit, offset)
                            .all();

                        return Response.json({
                            messages: results,
                            hasMore: offset + results.length < count
                        }, {
                            status: 200,
                            headers: respHeaders
                        });
                    }
                    else {
                        const userUuid = keepingUserTokens.get(body.utoken);
                        if (!userUuid) {
                            return Response.json({
                                error: "Unauthorized",
                                message: "Invalid user token."
                            }, {
                                status: 401,
                                headers: respHeaders
                            });
                        }

                        var { results } = await env.DB.prepare(
                            "select m.*, exists(select 1 from likes l where l.message_id = m.uuid and l.user_id = ?) as liked_by_user from messages m order by m.created_at desc limit ? offset ?"
                        )
                            .bind(userUuid, limit, offset)
                            .all();

                        return Response.json({
                            messages: results,
                            hasMore: offset + results.length < count
                        }, {
                            status: 200,
                            headers: respHeaders
                        });
                    }
                } catch (err: any) {
                    return Response.json({
                        error: "Internal Server Error",
                        message: err.message
                    }, {
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
                        return Response.json({
                            error: "Bad Request",
                            message: "content is missing."
                        }, {
                            status: 400,
                            headers: respHeaders
                        });
                    }

                    const userUuid = keepingUserTokens.get(body.utoken);
                    if (!userUuid) {
                        return Response.json({
                            error: "Unauthorized",
                            message: "Invalid user token."
                        }, {
                            status: 401,
                            headers: respHeaders
                        });
                    }

                    let user = "ANONYMOUS";

                    if (!body.anonymous) {
                        user = userUuid || "ANONYMOUS";
                    }

                    const uuid = crypto.randomUUID();

                    await env.DB.prepare("insert into Messages (content, user, uuid) values (?, ?, ?)")
                        .bind(content, user, uuid)
                        .run();

                    return Response.json({
                        messages: "Success",
                        uuid: uuid
                    }, {
                        status: 200,
                        headers: respHeaders
                    });
                } catch (err: any) {
                    return Response.json({
                        error: "Internal Server Error",
                        message: err.message
                    }, {
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
            return Response.json({
                error: "Bad Request",
                message: "body is null."
            }, {
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
                        return Response.json({
                            error: "Bad Request",
                            message: "id is missing."
                        }, {
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
                        return Response.json({
                            message: "Message not found."
                        }, {
                            status: 420,
                            headers : respHeaders
                        });
                    }
                    return Response.json({
                        count: (likesObj as { likes: number }).likes
                    }, {
                        status: 200,
                        headers: respHeaders
                    });
                }
                catch (err: any) {
                    return Response.json({
                        error: "Internal Server Error",
                        message: err.toString()
                    }, {
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
            return Response.json({
                error: "Bad Request",
                message: "body is null."
            }, {
                status: 400,
                headers: respHeaders
            });
        }

        switch (request.method) {
            case "POST":
                try {
                    const body = rawBody as {
                        utoken: string,
                        offset: number
                        limit: number
                    };

                    const utoken = body.utoken;
                    if (!utoken) {
                        return Response.json({
                            error: "Bad Request",
                            message: "utoken is missing."
                        }, {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const offset = body.offset || 0;
                    const limit = Math.min(body.limit || 20, 60);

                    const userUuid = keepingUserTokens.get(body.utoken);
                    if (!userUuid) {
                        return Response.json({
                            error: "Unauthorized",
                            message: "Invalid user token."
                        }, {
                            status: 401,
                            headers: respHeaders
                        });
                    }

                    const likedMsgs = (await env.DB.prepare(
                        "select l.message_id from Likes l inner join Messages m on l.message_id = m.uuid order by m.created_at desc limit ? offset ? where l.user_id = ? "
                    )
                        .bind(userUuid, limit, offset)
                        .all()).results;

                    if (!likedMsgs) {
                        return Response.json({
                            message: "User not found."
                        }, {
                            status: 420,
                            headers : respHeaders
                        });
                    }
                    return Response.json({
                        messages: likedMsgs
                    }, {
                        status: 200,
                        headers: respHeaders
                    });
                }
                catch (err: any) {
                    return Response.json({
                        error: "Internal Server Error",
                        message: err.toString()
                    }, {
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
            return Response.json({
                error: "Bad Request",
                message: "body is null."
            }, {
                status: 400,
                headers: respHeaders
            });
        }

        switch (request.method) {
            case "PATCH":
                try {
                    const body = rawBody as {
                        uuid: string,
                        utoken: string
                    };

                    const uuid = body.uuid;
                    if (!uuid) {
                        return Response.json({
                            error: "Bad Request",
                            message: "uuid is missing."
                        }, {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const utoken = body.utoken;
                    if (!utoken) {
                        return Response.json({
                            error: "Bad Request",
                            message: "utoken is missing."
                        }, {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const userUuid = keepingUserTokens.get(body.utoken);
                    if (!userUuid) {
                        return Response.json({
                            error: "Unauthorized",
                            message: "Invalid user token."
                        }, {
                            status: 401,
                            headers: respHeaders
                        });
                    }

                    await env.DB.prepare(
                        "INSERT INTO Likes (user_id, message_id) VALUES (?, ?);"
                    )
                        .bind(userUuid, uuid)
                    .run();

                    return new Response(null, {
                        status: 200,
                        headers: respHeaders
                    });
                } catch (err: any) {
                    return Response.json({
                        error: "Internal Server Error",
                        message: err.message
                    }, {
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
            return Response.json({
                error: "Bad Request",
                message: "body is null."
            }, {
                status: 400,
                headers: respHeaders
            });
        }

        switch (request.method) {
            case "PATCH":
                try {
                    const body = rawBody as {
                        uuid: string,
                        utoken: string
                    };

                    if (!body.uuid) {
                        return Response.json({
                            error: "Bad Request",
                            message: "id is missing."
                        }, {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    if (!body.utoken) {
                        return Response.json({
                            error: "Bad Request",
                            message: "utoken is missing."
                        }, {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const userUuid = keepingUserTokens.get(body.utoken);
                    if (!userUuid) {
                        return Response.json({
                            error: "Unauthorized",
                            message: "Invalid user token."
                        }, {
                            status: 401,
                            headers: respHeaders
                        });
                    }

                    await env.DB.prepare(
                        "DELETE FROM Likes WHERE user_id = ? AND message_id = ?;"
                    )
                        .bind(userUuid, body.uuid)
                        .run();

                    return new Response(null, {
                        status: 200,
                        headers: respHeaders
                    });
                } catch (err: any) {
                    return Response.json({
                        error: "Internal Server Error",
                        message: err.message
                    }, {
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
            return Response.json({
                error: "Bad Request",
                message: "body is null."
            }, {
                status: 400,
                headers: respHeaders
            });
        }
        
        switch (request.method) {
            case "POST":
                try {
                    const body = rawBody as {
                        uuid: string,
                    };

                    if (!body.uuid) {
                        return Response.json({
                            error: "Bad Request",
                            message: "uuid is missing."
                        }, {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    let trueUuid;
                    if (!(trueUuid = keepingUserTokens.get(body.uuid)))
                        trueUuid = body.uuid;

                    const { name } = await env.DB.prepare(
                        "select name from Users where uuid = ?"
                    )
                        .bind(trueUuid)
                        .first() as { name: string };

                    if (!name) {
                        return Response.json({
                            message: "User not found."
                        }, {
                            status: 420,
                            headers: respHeaders
                        });
                    }

                    return Response.json({
                        name: name
                    }, {
                        status: 200,
                        headers: respHeaders
                    });
                } catch (err: any) {
                    return Response.json({
                        error: "Internal Server Error",
                        message: err.message
                    }, {
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
            return Response.json({
                error: "Bad Request",
                message: "body is null."
            }, {
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
                        return Response.json({
                            error: "Bad Request",
                            message: "username is missing."
                        }, {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const inputPassword = body.password;
                    if (!inputPassword) {
                        return Response.json({
                            error: "Bad Request",
                            message: "password is missing."
                        }, {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const user = (await env.DB.prepare(
                        "select uuid, password from Users where name = ?"
                    )
                    .bind(inputUsername)
                        .first()) as { uuid: string, password: string };

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

                    var newToken = crypto.randomUUID();
                    keepingUserTokens.set(newToken, user.uuid);

                    return Response.json({
                        utoken: newToken
                    }, {
                        status: 200,
                        headers: respHeaders
                    });
                }
                catch (err: any) {
                    return Response.json({
                        error: "Internal Server Error",
                        message: err.toString()
                    }, {
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

    async unlogin(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const rawBody = await request.json();

        if (!rawBody) {
            return Response.json({
                error: "Bad Request",
                message: "body is null."
            }, {
                status: 400,
                headers: respHeaders
            });
        }

        switch (request.method) {
            case "POST":
                try {
                    const body = rawBody as {
                        utoken: string
                    }

                    if (!keepingUserTokens.delete(body.utoken)) {
                        return Response.json({
                            messages: "User token not found"
                        }, {
                            status: 404,
                            headers: respHeaders
                        });
                    }

                    return Response.json({
                        messages: "Success"
                    }, {
                        status: 200,
                        headers: respHeaders
                    });
                }
                catch (err: any) {
                    return Response.json({
                        error: "Internal Server Error",
                        message: err.toString()
                    }, {
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

    async register(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const rawBody = await request.json();

        if (!rawBody) {
            return Response.json({
                error: "Bad Request",
                message: "body is null."
            }, {
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
                        return Response.json({
                            error: "Bad Request",
                            message: "username is missing."
                        }, {
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
                        return Response.json({
                            error: "Username Already Exists",
                        }, {
                            status: 480
                        });
                    }

                    const inputPassword = body.password;
                    if (!inputPassword) {
                        return Response.json({
                            error: "Bad Request",
                            message: "password is missing."
                        }, {
                            status: 400,
                            headers : respHeaders
                        });
                    }

                    const passwordHash = await hash(inputPassword);

                    const uuid = crypto.randomUUID();

                    await env.DB.prepare(
                        "insert into Users (uuid, name, password) values (?, ?, ?)"
                    )
                    .bind(uuid, inputUsername, passwordHash)
                    .run();
                    
                    return new Response("Ok", {
                        status: 200,
                        headers: respHeaders
                    });
                }
                catch (err: any) {
                    return Response.json({
                        error: "Internal Server Error",
                        message: err.toString()
                    }, {
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
    },

    async validate_token(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const rawBody = await request.json();

        if (!rawBody) {
            return Response.json({
                error: "Bad Request",
                message: "body is null."
            }, {
                status: 400,
                headers: respHeaders
            });
        }

        switch (request.method) {
            case "POST":
                try {
                    const body = rawBody as {
                        utoken: string
                    }

                    return Response.json({
                        valid: keepingUserTokens.has(body.utoken)
                    }, {
                        status: 200,
                        headers: respHeaders
                    });
                }
                catch (err: any) {
                    return Response.json({
                        error: "Internal Server Error",
                        message: err.toString()
                    }, {
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
    }
}

async function hash(message: string) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-512', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.toUpperCase();
}