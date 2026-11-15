package org.fiercoin.wallet;

/** Stops the node off the main thread (shutdown can take a few seconds). */
final class StopTask implements Runnable {
    private final NodeService service;

    StopTask(NodeService service) {
        this.service = service;
    }

    @Override
    public void run() {
        service.stopAndExit();
    }
}
