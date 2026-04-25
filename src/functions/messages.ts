const respHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json"
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
            headers: respHeaders
          });
        }

      case "DELETE":
        return new Response(JSON.stringify(
          {
            error: "Method Not Implemented",
            message: request.method + " is not implemented."
          }), {
          status: 501,
          headers: respHeaders
        });

      default:
        return new Response(JSON.stringify(
          {
            error: "Method Not Allowed",
            message: request.method + " is not allowed."
          }), {
          status: 405,
          headers: {
            ...respHeaders,
            "Allow": "POST, PATCH, DELETE"
          }
        });
    }
  }
}