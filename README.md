# Cycle Sandbox 🏖️

The purpose of this project is to enable you to run Cycle Components in Web Workers, and mount them side-by-side Cycle Components in the main thread.

This is enabled by the Cycle Architetcure, because all side-effects happen in Drivers.

Cycle Sandbox provides a way to use Drivers in a Web Worker thread that otherwise wouldn't.

If you are unfamiliar with the Cycle Architecture, and what Drivers and Components are, you can learn from the official Cycle.js documentation [here](https://cycle.js.org).

As an example @cycle/http works in a Web Worker thread witout any modification.

On the other hand @cycle/dom will not work, because the side-effects in @cycle/dom mandate DOM access, and DOM references only exist in our main thread, thus our Web Worker will throw an error.

To solve this problem we need to establish connections between the DOM source in the main thread, and the DOM source in the Web Worker, likewise we must establish a connection between the DOM sink in the Web Worker, to the DOM sink in the main thread.

## A Note on Performance

For most cases running your Cycle Components in a Web Worker will provide no performance benifits, the purpose of this project is more to proove that we can declare complex UI in a seperate thread, and we can do so without significant performance drawbacks.

### Establishing Connections with Connectors

We call these connections, simply connections, and to establish them we need to write two Connectors.
A Connector for main, and a Connector for the Web Worker.

A Connector in the main thread returns a Component mapping a source to a sink, and a Connector in the Web Worker returns a Driver mapping a sink to a source.

You can see the type signatures of Connectors in ```/src/types.ts```.

### Bundled Connectors

We aim to provide connectors for all @cylce/* drivers, as of now we provide a Connector for @cycle/dom. 

We also provide a set of default connectors ```/src/default```. You can use these Connectors for any Driver that provides a Stream as source, and expects a Stream as sink. It is important that the value of the Stream is contained and can be safely transfered between threads, too keep things simple anything that can be serialized to JSON would pass these critirea. Because these connectors have a symetrical type-signature, we can use the same connector for the main, and worker thread.

### A Note on Cycle Run

As you may have seen in ```/sample/widget.ts``` we are not using ```@cycle/run``` directly. This is because we wan't to save resources, running thousands of Web Workers will make most browsers grumpy. Instead Cycle Sandbox will run multiple instances of the same Component in the same WebWorker, they will remain totally isolated in the Web Worker, and you need not worry about information leaking between instances of the same Component.

Instead of using ```run(main, drivers)``` we have a command called ```setup(main, drivers, connectors)```. It is very similar to run, except it won't run anything imidiatlely, it will wait until the main thread asks to start a new instance. These processes are all maintained in the innards of ```@cycle/sandbox``` feel free to browse the source code to get a better understanding of how this works, though this is not needed in order to use this library.

When invoking ```setup(main, drivers, connectors)```, make sure that drivers such as @cycle/http are declared in the drivers object, and only connectors are declared in the connectors object. The connectors object will initialize the connections and provide the resulting driver as a source in your main function.

### Mounting a Component from the Main Thread

To mount a Component in a Web Worker, you must provide the Sandbox driver to your application.
Sandbox.select is very similar to the setup function describe before, the bundle is a string identifying your resource, sources are the sources you desire to connect to your Web Worker. For every source you must provide a connector with the same key, e.g. ```let sources = { DOM : sources.DOM }``` then ```let connectors = { DOM : DOMMainConnector }```. 

Finaly you must specify which sinks you expect from the Component, this is nececary because sinks are bound synchrounosly in the Cycle Architecture, but are only known asynchronosly in Cycle Sandbox.

```sources.Sandbox.select(bundle, sources, connectors, expectedSinks)```

This will return a stream of sinks once the component is mounted and running.