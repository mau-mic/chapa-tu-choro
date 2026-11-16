using System.Net;
using Microsoft.Extensions.Options;

namespace ChapaTuChoro.Api.Http;

// Enable only behind the private Lambda URL/OAC and authenticated edge function.
// The edge overwrites this header; never enable on an independently public API.
public sealed class VerifiedEdgeClientIpMiddleware(RequestDelegate next, IOptions<ProxyTrustOptions> options)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (options.Value.UseVerifiedEdgeClientIp)
        {
            var value = context.Request.Headers["x-ctc-client-ip"];
            if (value.Count != 1 || !IPAddress.TryParse(value[0], out var address))
            {
                await Results.Problem(statusCode: 400, title: "api.invalid_proxy_identity",
                    detail: "No se pudo verificar el origen de la solicitud.").ExecuteAsync(context);
                return;
            }
            context.Connection.RemoteIpAddress = address;
        }
        await next(context);
    }
}
