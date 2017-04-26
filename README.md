# Cycle Sandbox

The purpose of this project is to enable you to run Cycle Components in Web Workers, and mount them side-by-side Cycle Components in the main thread.

This is enabled by the Cycle Architetcure, because all side-effects happen in Drivers.

Cycle Sandbox provides a way to use drivers in a Web Worker thread that otherwise wouldn't.

As an example @cycle/http works in a Web Worker thread witout any modification.

On the other hand @cycle/dom will not work, because the side-effects in @cycle/dom mandate DOM access, and DOM references only exist in our main thread, thus our Web Worker will throw an error.

To solve this problem we need to establish connections between the DOM source in the main thread, and the DOM source in the Web Worker, likewise we must establish a connection between the DOM sink in the Web Worker, to the DOM sink in the main thread.

## Establishing Connections with Connectors

We call these connections, simply connections, and to establish them we need to write two connectors.
A connector for main, and a connector for the Web Worker.

Connectors return either Components or Drivers. A Connector in the main thread returns a Component, and a Connector in the Web Worker returns a Driver.

You can see the type signatures of Connectors in ```/src/types.ts```.

We also provide a set of default connectors, these are for connecting drivers that simply have a Stream as source. It is important that the value of the Stream is contained and can be safely transfered between threads, too keep things simple anything that can be serialized to JSON would pass these critirea.