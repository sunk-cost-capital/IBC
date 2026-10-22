package jclient;

/**
 * Stand-in for TWS's entry point; see ibgateway.GWClient. Never part of
 * IBC.jar.
 */
public class LoginFrame {
    public static void main(String[] args) {
        System.out.println("SUNK_IBC_SMOKE tws started, settings=" + (args.length > 0 ? args[0] : ""));
        System.exit(0);
    }
}
