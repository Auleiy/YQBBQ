export default {
    async messages(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const headers = {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json"
        }

        switch (request.method) {

            case "GET":
                if (request.method !== "GET")
                    return new Response("Method Not Allowed", { status: 405 })

                try {
                    const url = new URL(request.url);
                    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 60);
                    const offset = parseInt(url.searchParams.get("offset") || '0');

                    const { results } = await env.DB.prepare(
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
                        headers
                    });
                } catch (err: any) {
                    return new Response(JSON.stringify({
                        error: "Internal Server Error",
                        message: err.message
                    }), {
                        status: 500,
                        headers : {
                            "Content-Type": "application/json"
                        }
                    });
                }
            
            case "POST":
                return new Response(JSON.stringify(
                    {
                        error: "Method Not Implemented", 
                        message: request.method + " is not implemented."
                    }), {
                        status: 501,
                        headers : {
                            "Content-Type": "application/json"
                        }
                    });

            case "DELETE":
                return new Response(JSON.stringify(
                    {
                        error: "Method Not Implemented", 
                        message: request.method + " is not implemented."
                    }), {
                        status: 501,
                        headers : {
                            "Content-Type": "application/json"
                        }
                    });

            default:
                return new Response(JSON.stringify(
                    {
                        error: "Method Not Allowed", 
                        message: request.method + " is not allowed."
                    }), {
                        status: 405,
                        headers : {
                            "Content-Type": "application/json",
                            "Allow": "GET, POST, DELETE"
                        }
                    });
        }
    }
}