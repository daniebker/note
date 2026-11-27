package io.github.daniebker.note;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NotePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
