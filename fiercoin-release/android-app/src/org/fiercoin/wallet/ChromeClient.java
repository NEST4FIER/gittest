package org.fiercoin.wallet;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

/**
 * Shows JS dialogs (confirm/prompt/alert, from the base class), lets the page use the camera
 * for QR scanning, and lets it pick a picture of a QR code.
 */
public final class ChromeClient extends WebChromeClient {
    static final int REQ_CAMERA = 2;
    static final int REQ_PICK_IMAGE = 3;

    private final MainActivity activity;
    private PermissionRequest pendingCamera;
    private ValueCallback<Uri[]> pendingFile;

    ChromeClient(MainActivity activity) {
        this.activity = activity;
    }

    @Override
    public void onPermissionRequest(PermissionRequest request) {
        boolean wantsCamera = false;
        for (String r : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCamera = true;
        }
        if (!wantsCamera) {
            request.deny();
            return;
        }
        if (activity.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        } else {
            pendingCamera = request;
            activity.requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
        }
    }

    /** Called by MainActivity after the user answers the camera permission question. */
    void onCameraPermission(boolean granted) {
        if (pendingCamera == null) return;
        if (granted) {
            pendingCamera.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        } else {
            pendingCamera.deny();
        }
        pendingCamera = null;
    }

    @Override
    public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (pendingFile != null) pendingFile.onReceiveValue(null);
        pendingFile = callback;
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("image/*");
        try {
            activity.startActivityForResult(Intent.createChooser(pick, "Pick a picture of the QR code"), REQ_PICK_IMAGE);
        } catch (Exception e) {
            pendingFile = null;
            return false;
        }
        return true;
    }

    /** Called by MainActivity with the picked picture (or null if cancelled). */
    void onImagePicked(Uri uri) {
        if (pendingFile == null) return;
        pendingFile.onReceiveValue(uri == null ? null : new Uri[]{uri});
        pendingFile = null;
    }
}
