import * as v1 from "./api/api_v1"

const apiVersions: Record<string, any> = {
    'v1': v1
}

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
            
            try
            {
                const mod = apiVersions[version];
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
            } catch (err: any) {
                if (err.message?.includes("No such module")) {
                    return new Response(JSON.stringify({
                        error: "API Version Not Found",
                        message: `API Version ${version} not found: ${err.message}`
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

        try {
            const staticResponse = await env.ASSETS.fetch(request);

            if (staticResponse.ok){
                return staticResponse;
            }
        }
        catch { }

        return new Response("What do you wan't to get???", {
            status: 404,
            headers: {
                "Content-Type": "plaintext",
            }
        });
    }
}