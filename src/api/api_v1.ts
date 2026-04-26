const respHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
}
const respHeadersPlaintext = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "plaintext"
}

interface Token {
    uuid: string,
    latestActivated: number
}

async function addToken(env: Env, token: string, uuid: string) {
    await env.KV.put(token, JSON.stringify({ uuid, latestActivated: new Date().getTime() } as Token));
}

async function resolveToken(env: Env, token: string): Promise<string | null> {
    const v = await env.KV.get(token);
    if (!v) return null;
    var tokenKv = JSON.parse(v) as Token;

    var delta = Date.now() - new Date(tokenKv.latestActivated).getTime();

    if (delta > 7 * 24 * 60 * 60 * 1000) {
        await deleteToken(env, token);
        return null;
    }
    if (delta > 24 * 60 * 60 * 1000) {
        await addToken(env, token, tokenKv.uuid);
    }

    return tokenKv.uuid;
}

async function deleteToken(env: Env, token: string): Promise<boolean> {
    if (!(await env.KV.get(token))) {
        return false;
    }
    await env.KV.delete(token);
    return true;
}

async function isMod(env: Env, uuid: string): Promise<boolean> {
    const { is_mod } = await env.DB.prepare(
        "select is_mod from Users where uuid = ?"
    )
        .bind(uuid)
        .first() as { is_mod: number };

    return is_mod !== 0;
}

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

                    async function notLoggedIn(): Promise<Record<string, any>[]> {
                        const { results } = await env.DB.prepare(
                            "select \
                                m.uuid,\
                                iif(m.anonymous = 1, null, m.user) as user,\
                                m.content,\
                                m.created_at,\
                                m.likes,\
                                m.anonymous\
                            from messages m \
                            order by m.created_at desc \
                            limit ? offset ? "
                        )
                            .bind(limit, offset)
                            .all();

                        return results;
                    }

                    async function loggedIn(userUuid: string): Promise<Record<string, any>[]> {
                        const { results } = await env.DB.prepare(
                            "select \
                                m.uuid,\
                                iif(m.anonymous = 1 and m.user != ?, null, m.user) as user,\
                                m.content,\
                                m.created_at,\
                                m.likes,\
                                m.anonymous,\
                                exists(select 1 from likes l where l.message_id = m.uuid and l.user_id = ?) as liked_by_user\
                            from messages m \
                            order by m.created_at desc \
                            limit ? offset ? "
                        )
                            .bind(userUuid, userUuid, limit, offset)
                            .all();

                        return results;
                    }

                    async function loggedInMod(userUuid: string): Promise<Record<string, any>[]> {
                        const { results } = await env.DB.prepare(
                            "select \
                                m.uuid,\
                                m.user,\
                                m.content,\
                                m.created_at,\
                                m.likes,\
                                m.anonymous,\
                                exists(select 1 from likes l where l.message_id = m.uuid and l.user_id = ?) as liked_by_user\
                            from messages m \
                            order by m.created_at desc \
                            limit ? offset ? "
                        )
                            .bind(userUuid, limit, offset)
                            .all();

                        return results;
                    }

                    var results;

                    if (!body.utoken) {
                        results = await notLoggedIn();
                    }
                    else {
                        const userUuid = await resolveToken(env, body.utoken);
                        if (!userUuid) {
                            results = await notLoggedIn();
                        }
                        else if (await isMod(env, userUuid)) {
                            results = await loggedInMod(userUuid);
                        }
                        else {
                            results = await loggedIn(userUuid);
                        }
                    }

                    return Response.json({
                        messages: results,
                        hasMore: offset + results.length < count
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

                    const userUuid = await resolveToken(env, body.utoken);
                    if (!userUuid) {
                        return Response.json({
                            error: "Unauthorized",
                            message: "Invalid user token."
                        }, {
                            status: 401,
                            headers: respHeaders
                        });
                    }

                    const uuid = crypto.randomUUID();

                    await env.DB.prepare("insert into Messages (content, user, uuid, anonymous) values (?, ?, ?, ?)")
                        .bind(content, userUuid, uuid, body.anonymous ? 1 : 0)
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

            default:
                return new Response(JSON.stringify(
                    {
                        error: "Method Not Allowed",
                        message: request.method + " is not allowed."
                    }), {
                    status: 405,
                    headers: {
                        ...respHeaders,
                        "Allow": "POST, PATCH"
                    }
                });
        }
    },

    async delete_message(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
                        uuid: string,
                        utoken: string | undefined | null
                    };

                    const userUuid = await resolveToken(env, body.utoken || "");
                    if (!userUuid) {
                        return Response.json({
                            error: "Unauthorized",
                            message: "Invalid user token."
                        }, {
                            status: 401,
                            headers: respHeaders
                        });
                    }

                    const { user } = await env.DB.prepare(
                        "select user from Messages where uuid = ?"
                    )
                        .bind(body.uuid)
                        .first() as { user: string };

                    if (user !== userUuid) {
                        const is_mod = isMod(env, userUuid);

                        if (!is_mod) {
                            return Response.json({
                                error: "Forbidden",
                                message: "You can only delete your own messages."
                            }, {
                                status: 403,
                                headers: respHeaders
                            });
                        }
                    }

                    await env.DB.prepare(
                        "delete from Messages where uuid = ?"
                    )
                        .bind(body.uuid)
                        .run();

                    return Response.json({
                        messages: "Success"
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

                    const userUuid = await resolveToken(env, body.utoken);
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

                    const userUuid = await resolveToken(env, body.utoken);
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

                    const userUuid = await resolveToken(env, body.utoken);
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
                    if (!(trueUuid = await resolveToken(env, body.uuid)))
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

    async delete_user(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
                        utoken: string | undefined | null
                    };

                    const userUuid = await resolveToken(env, body.utoken || "");
                    if (!userUuid) {
                        return Response.json({
                            error: "Unauthorized",
                            message: "Invalid user token."
                        }, {
                            status: 401,
                            headers: respHeaders
                        });
                    }

                    const is_mod = isMod(env, userUuid);

                    if (!is_mod) {
                        return Response.json({
                            error: "Forbidden",
                            message: "Only moderators can delete users."
                        }, {
                            status: 403,
                            headers: respHeaders
                        });
                    }

                    await env.DB.prepare(
                        "delete from Users where uuid = ?"
                    )
                        .bind(body.uuid)
                        .run();

                    await env.DB.prepare(
                        "delete from Messages where user = ?"
                    )
                        .bind(body.uuid)
                        .run();

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
                    await addToken(env, newToken, user.uuid);

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

                    if (!await deleteToken(env, body.utoken)) {
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

                    const userUuid = await resolveToken(env, body.utoken);
                    if (!userUuid) {
                        return Response.json({
                            valid: false
                        }, {
                            status: 200,
                            headers: respHeaders
                        });
                    }

                    const is_mod = isMod(env, userUuid);

                    return Response.json({
                        valid: true,
                        is_mod,
                        uuid: userUuid
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