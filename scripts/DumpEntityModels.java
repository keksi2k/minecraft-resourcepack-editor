// Dumps baked vanilla entity model geometry to JSON. Entity models are defined in Java code,
// not in resource packs, so this runs the game's own layer builders against a client jar.
//
//   java -cp "client.jar;libs/*" scripts/DumpEntityModels.java              -> list all layers
//   java -cp "client.jar;libs/*" scripts/DumpEntityModels.java out.json L... -> dump layers L
//   java -cp "client.jar;libs/*" scripts/DumpEntityModels.java --refresh out.json -> re-dump layers in out.json
//
// (use ':' instead of ';' as classpath separator on Linux/macOS; libs = the version's libraries)

import java.io.PrintWriter;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.*;

public class DumpEntityModels {
    static Object get(Object o, String field) throws Exception {
        Class<?> c = o.getClass();
        while (c != null) {
            try {
                Field f = c.getDeclaredField(field);
                f.setAccessible(true);
                return f.get(o);
            } catch (NoSuchFieldException e) {
                c = c.getSuperclass();
            }
        }
        throw new NoSuchFieldException(field);
    }

    static String num(float f) {
        if (f == Math.rint(f)) return Integer.toString((int) f);
        String s = String.format(Locale.ROOT, "%.5f", f).replaceAll("0+$", "");
        return s.endsWith(".") ? s.substring(0, s.length() - 1) : s;
    }

    static void part(StringBuilder sb, Object p) throws Exception {
        Class<?> c = p.getClass();
        sb.append("{\"pose\":[");
        String[] pose = {"x", "y", "z", "xRot", "yRot", "zRot", "xScale", "yScale", "zScale"};
        for (int i = 0; i < pose.length; i++) sb.append(i > 0 ? "," : "").append(num(c.getField(pose[i]).getFloat(p)));
        sb.append("],\"visible\":").append(c.getField("visible").getBoolean(p));
        sb.append(",\"cubes\":[");
        List<?> cubes = (List<?>) get(p, "cubes");
        for (int i = 0; i < cubes.size(); i++) {
            if (i > 0) sb.append(',');
            Object[] polys = (Object[]) cubes.get(i).getClass().getField("polygons").get(cubes.get(i));
            sb.append('[');
            for (int j = 0; j < polys.length; j++) {
                if (j > 0) sb.append(',');
                Object[] verts = (Object[]) polys[j].getClass().getMethod("vertices").invoke(polys[j]);
                sb.append('[');
                for (int k = 0; k < verts.length; k++) {
                    Object v = verts[k];
                    if (k > 0) sb.append(',');
                    sb.append(num((float) get(v, "x"))).append(',').append(num((float) get(v, "y"))).append(',')
                      .append(num((float) get(v, "z"))).append(',').append(num((float) get(v, "u"))).append(',')
                      .append(num((float) get(v, "v")));
                }
                sb.append(']');
            }
            sb.append(']');
        }
        sb.append("],\"children\":{");
        Map<?, ?> children = (Map<?, ?>) get(p, "children");
        boolean first = true;
        for (Map.Entry<?, ?> e : children.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            sb.append('"').append(e.getKey()).append("\":");
            part(sb, e.getValue());
        }
        sb.append("}}");
    }

    public static void main(String[] args) throws Exception {
        Class<?> defs = Class.forName("net.minecraft.client.model.geom.LayerDefinitions");
        Map<?, ?> roots = (Map<?, ?>) defs.getMethod("createRoots").invoke(null);
        Map<String, Object> byName = new TreeMap<>();
        for (Map.Entry<?, ?> e : roots.entrySet()) {
            Object loc = e.getKey();
            Object model = get(loc, "model");
            byName.put(model + "#" + get(loc, "layer"), e.getValue());
        }
        if (args.length == 0) {
            byName.keySet().forEach(System.out::println);
            return;
        }
        if (args[0].equals("--refresh")) {
            // Re-export exactly the layers already present in the given file.
            String existing = new String(java.nio.file.Files.readAllBytes(java.nio.file.Path.of(args[1])), "UTF-8");
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"([a-z0-9_.-]+:[a-z0-9_/.-]+#[a-z0-9_]+)\":\\{\"tex\"").matcher(existing);
            List<String> next = new ArrayList<>(List.of(args[1]));
            while (m.find()) next.add(m.group(1));
            args = next.toArray(new String[0]);
        }
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (int i = 1; i < args.length; i++) {
            Object layer = byName.get(args[i]);
            if (layer == null) throw new IllegalArgumentException("Unknown layer " + args[i]);
            Object material = get(layer, "material");
            Method bake = layer.getClass().getMethod("bakeRoot");
            if (!first) sb.append(',');
            first = false;
            sb.append('"').append(args[i]).append("\":{\"tex\":[").append(get(material, "xTexSize")).append(',')
              .append(get(material, "yTexSize")).append("],\"root\":");
            part(sb, bake.invoke(layer));
            sb.append('}');
        }
        sb.append('}');
        try (PrintWriter w = new PrintWriter(args[0], "UTF-8")) {
            w.print(sb);
        }
        System.out.println("wrote " + (args.length - 1) + " layers to " + args[0]);
    }
}
