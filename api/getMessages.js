export async function onRequest(ctx) {
    const { request, env } = ctx;

    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Content-Typ": "application/json"
    };

    if (request.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        });
    }

    if (request.method === "GET") {
        try {
            const url = new URL(request.url);
            const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
            const offset = parseInt(url.searchParams.get("offset") || '0');

            const { results } = await env.DB.prepare(
                "select * from Messages order by created_at desc limit ? offset ?"
            )
            .bind(limit, offset)
            .all();

            const total = await env.DB.prepare("select count(*) as count from Messages").first();

            return new Response(JSON.stringify({
                messages: results,
                hasMore = offset + results.length < total.count
            }), { headers });
        } catch (error) {
            return new Response(JSON.stringify({ error: "Failed to get messages.", details: error.messages }), {
                status: 500,
                headers
            });
        }
    }

    return new Response("Method not allowed", { status: 405 });
}