Blocks until something you are waiting on happens: a background job or service you started finishes, a reply arrives to a message you sent, or the user interrupts. Returns immediately if nothing is pending. A safety cap may return a snapshot of still-running work.
Results and messages are delivered automatically, so use this only when you have nothing else to do; never poll in a loop.
