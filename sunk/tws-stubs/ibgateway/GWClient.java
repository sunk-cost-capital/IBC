package ibgateway;

/**
 * Stand-in for IB Gateway's entry point. IBC calls it by name, so the build
 * compiles against this instead of IBKR's proprietary jars, and the smoke
 * test runs it as a fake Gateway. Never part of IBC.jar.
 */
public class GWClient {
    public static void main(String[] args) {
        System.out.println("SUNK_IBC_SMOKE gateway started, settings=" + (args.length > 0 ? args[0] : ""));
        System.exit(0);
    }
}
