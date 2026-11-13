package org.fiercoin.wallet;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** Keeps the FierCoin node (and miner) running in the background with a notification. */
public class NodeService extends Service {
    static final String ACTION_STOP = "org.fiercoin.wallet.STOP";
    private static final String CHANNEL = "fiercoin";
    private static Process process;
    private PowerManager.WakeLock wakeLock;

    static synchronized boolean isRunning() {
        if (process == null) return false;
        try {
            process.exitValue();
            return false;
        } catch (IllegalThreadStateException stillRunning) {
            return true;
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            new Thread(new StopTask(this)).start();
            return START_NOT_STICKY;
        }
        showNotification();
        startNode();
        return START_STICKY;
    }

    private void showNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "FierCoin node", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CHANNEL)
                .setContentTitle("FierCoin is running")
                .setContentText("Your node and miner are working. Tap to open.")
                .setSmallIcon(R.drawable.ic_stat)
                .setContentIntent(open)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(1, n);
        }
    }

    private synchronized void startNode() {
        if (isRunning()) return;
        File dir = Node.dataDir(this);
        List<String> cmd = new ArrayList<>();
        cmd.add(getApplicationInfo().nativeLibraryDir + "/libfiercoind.so");
        cmd.add("-datadir=" + dir.getAbsolutePath());
        cmd.add("-server=1");
        cmd.add("-rpcbind=127.0.0.1");
        cmd.add("-rpcallowip=127.0.0.1");
        cmd.add("-rpcport=" + Node.RPC_PORT);
        cmd.add("-rpcuser=fier");
        cmd.add("-rpcpassword=" + Node.rpcPassword(this));
        cmd.add("-rpcthreads=4");
        cmd.add("-dbcache=32");
        cmd.add("-maxmempool=50");
        cmd.add("-maxconnections=16");
        cmd.add("-printtoconsole=0");
        cmd.add("-fallbackfee=0.0001");
        for (String node : Node.nodes(this)) cmd.add("-addnode=" + node);
        try {
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.environment().put("LD_LIBRARY_PATH", getApplicationInfo().nativeLibraryDir);
            pb.directory(dir);
            pb.redirectErrorStream(true);
            pb.redirectOutput(new File(dir, "output.txt"));
            process = pb.start();
        } catch (Exception e) {
            process = null;
            Node.prefs(this).edit().putString("lasterror", "Could not start node: " + e.getMessage()).apply();
            return;
        }
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (wakeLock == null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FierCoin:node");
            wakeLock.setReferenceCounted(false);
        }
        wakeLock.acquire();
    }

    void stopAndExit() {
        stopNode();
        stopForeground(true);
        stopSelf();
    }

    private void stopNode() {
        Process p;
        synchronized (NodeService.class) {
            p = process;
        }
        if (p != null) {
            Node.rpc(this, "/", "stop", "[]");
            try {
                if (!p.waitFor(30, TimeUnit.SECONDS)) p.destroy();
            } catch (InterruptedException ignored) {
                p.destroy();
            }
            synchronized (NodeService.class) {
                process = null;
            }
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }

    @Override
    public void onDestroy() {
        stopNode();
        super.onDestroy();
    }
}
