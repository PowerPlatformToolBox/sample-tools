using Pptb.Sample.Worker;
using StreamJsonRpc;

using var handler = new HeaderDelimitedMessageHandler(Console.OpenStandardOutput(), Console.OpenStandardInput());
using var rpc = new JsonRpc(handler);
rpc.AddLocalRpcTarget(new WorkerMethods(rpc));
rpc.StartListening();
Console.Error.WriteLine("Sample worker ready; stdout is reserved for JSON-RPC.");
await rpc.Completion;