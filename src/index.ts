export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        var split = path.split('/').filter(x => x.length > 0);

        const folder = split[0];

        if (folder === "api")
        {
            const version = split[1];
            const method = split[2];
            
            const modPath = `./api/api_${version}.ts`;
            
            try
            {
                const mod = await import(modPath);
                const mth = mod.default?.[method];

                if (typeof mth !== "function") {
                    return new Response(JSON.stringify({
                        error: "Method Not Found",
                        message: `Method ${method} not found in api ${version}`
                    }), {
                        status: 404,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                }

                return await mth(request, env, ctx);
            }
            catch (err: any)
            {
                if (err.code === "MODULE_NOT_FOUND") {
                    return new Response(JSON.stringify({
                        error: "API Version Not Found",
                        message: `API Version ${version} not found.`
                    }), {
                        status: 404,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                }
                return new Response(JSON.stringify({
                    error: "Internal Server Error",
                    message: `${err.code}: ${err.message}`
                }), {
                    status: 500,
                    headers: {
                        "Content-Type": "application/json"
                    }
                });
            }
        }

        return new Response("Not Found", {
            status: 404,
            headers: {
                "Content-Type": "plaintext",
            }
        });
    }
}