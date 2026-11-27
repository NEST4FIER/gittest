package org.fiercoin.wallet;

/** Opens Android's print screen. Printing has to start on the main thread, not the page's bridge thread. */
final class PrintTask implements Runnable {
    private final MainActivity activity;
    private final String title;

    PrintTask(MainActivity activity, String title) {
        this.activity = activity;
        this.title = title;
    }

    @Override
    public void run() {
        activity.printPage(title);
    }
}
