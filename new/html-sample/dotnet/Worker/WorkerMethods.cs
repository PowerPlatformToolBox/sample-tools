using System.Text.Json;
using Newtonsoft.Json;
using StreamJsonRpc;

namespace Pptb.Sample.Worker;

public sealed class WorkerMethods(JsonRpc rpc)
{
    [JsonRpcMethod("platform/initialize")]
    public object Initialize(string protocol, int protocolVersion)
    {
        if (protocol != "jsonrpc-stdio-v1" || protocolVersion != 1) throw new InvalidOperationException("Unsupported PPTB worker protocol");
        return new { protocol, protocolVersion };
    }

    [JsonRpcMethod("accounts/summarizeByCountry")]
    public async Task<object> SummarizeAccountsByCountryAsync(int top, CancellationToken cancellationToken)
    {
        if (top is < 1 or > 100) throw new ArgumentOutOfRangeException(nameof(top), "Top must be between 1 and 100.");

        await rpc.NotifyAsync("progress", "Loading accounts from Dataverse...");
        var accounts = await rpc.InvokeWithParameterObjectAsync<AccountReply>(
            "dataverse/getAccounts",
            new { top },
            cancellationToken);

        var countries = accounts.Value
            .GroupBy(account => string.IsNullOrWhiteSpace(account.Address1Country) ? "Unspecified" : account.Address1Country.Trim(), StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(group => group.Count())
            .ThenBy(group => group.Key, StringComparer.OrdinalIgnoreCase)
            .Select(group => new { country = group.Key, count = group.Count() })
            .ToArray();

        await rpc.NotifyAsync("progress", "Account summary ready");
        return new { totalAccounts = accounts.Value.Length, countries };
    }

}

public sealed record AccountReply([property: JsonProperty("value")] AccountRow[] Value);

public sealed record AccountRow(
    [property: JsonProperty("name")] string? Name,
    [property: JsonProperty("address1_country")] string? Address1Country);