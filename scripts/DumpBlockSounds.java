// Dumps which sound events each vanilla block plays (break, step, place, hit, fall). Block sound types
// are assigned in Java code, not in resource packs, so this reads them from the game's block registry.
//
//   java -cp "client.jar;libs/*" scripts/DumpBlockSounds.java out.json
//
// (use ':' instead of ';' as classpath separator on Linux/macOS; libs = the version's libraries)
// Output: {"types":[[break,step,place,hit,fall],...],"blocks":{"minecraft:stone":[0],...},"extra":{"minecraft:oak_door":[...],...}}
// A block lists several types when its states sound different (e.g. a growing plant). "extra" holds
// the open/close/click sounds doors, trapdoors, buttons, pressure plates and fence gates take from
// their material (BlockSetType / WoodType).

import java.io.PrintWriter;
import java.lang.reflect.Method;
import java.util.*;

public class DumpBlockSounds {
    /** Block class → the sounds it plays from its material (field `type`). */
    static final String[][] EXTRA = {
        {"net.minecraft.world.level.block.DoorBlock", "doorOpen", "doorClose"},
        {"net.minecraft.world.level.block.TrapDoorBlock", "trapdoorOpen", "trapdoorClose"},
        {"net.minecraft.world.level.block.ButtonBlock", "buttonClickOn", "buttonClickOff"},
        {"net.minecraft.world.level.block.BasePressurePlateBlock", "pressurePlateClickOn", "pressurePlateClickOff"},
        {"net.minecraft.world.level.block.FenceGateBlock", "fenceGateOpen", "fenceGateClose"},
    };

    static Object field(Object o, String name) throws Exception {
        for (Class<?> c = o.getClass(); c != null; c = c.getSuperclass()) {
            try {
                var f = c.getDeclaredField(name);
                f.setAccessible(true);
                return f.get(o);
            } catch (NoSuchFieldException e) {
                // try the superclass
            }
        }
        throw new NoSuchFieldException(name);
    }

    /** The material sounds of a door, button … (empty for other blocks). */
    static List<String> extraSounds(Object block) throws Exception {
        List<String> out = new ArrayList<>();
        for (String[] e : EXTRA) {
            if (!Class.forName(e[0]).isInstance(block)) continue;
            Object material = field(block, "type");
            for (int i = 1; i < e.length; i++) {
                Object event = material.getClass().getMethod(e[i]).invoke(material);
                out.add(event.getClass().getMethod("location").invoke(event).toString());
            }
        }
        return out;
    }

    public static void main(String[] args) throws Exception {
        Class.forName("net.minecraft.SharedConstants").getMethod("tryDetectVersion").invoke(null);
        Class.forName("net.minecraft.server.Bootstrap").getMethod("bootStrap").invoke(null);
        Iterable<?> blocks = (Iterable<?>) Class.forName("net.minecraft.core.registries.BuiltInRegistries").getField("BLOCK").get(null);
        Method getKey = blocks.getClass().getMethod("getKey", Object.class);
        String[] getters = {"getBreakSound", "getStepSound", "getPlaceSound", "getHitSound", "getFallSound"};

        List<String> types = new ArrayList<>();
        Map<String, Integer> typeIndex = new HashMap<>();
        Map<String, Set<Integer>> byBlock = new TreeMap<>();
        Map<String, List<String>> extra = new TreeMap<>();
        for (Object block : blocks) {
            String id = getKey.invoke(blocks, block).toString();
            Object definition = block.getClass().getMethod("getStateDefinition").invoke(block);
            Set<Integer> used = new TreeSet<>();
            for (Object state : (List<?>) definition.getClass().getMethod("getPossibleStates").invoke(definition)) {
                Object type = state.getClass().getMethod("getSoundType").invoke(state);
                StringBuilder sb = new StringBuilder("[");
                for (int i = 0; i < getters.length; i++) {
                    Object event = type.getClass().getMethod(getters[i]).invoke(type);
                    Object location = event.getClass().getMethod("location").invoke(event);
                    sb.append(i > 0 ? "," : "").append('"').append(location).append('"');
                }
                String key = sb.append(']').toString();
                Integer index = typeIndex.get(key);
                if (index == null) {
                    index = types.size();
                    typeIndex.put(key, index);
                    types.add(key);
                }
                used.add(index);
            }
            byBlock.put(id, used);
            List<String> sounds = extraSounds(block);
            if (!sounds.isEmpty()) extra.put(id, sounds);
        }

        StringBuilder sb = new StringBuilder("{\"types\":[\n").append(String.join(",\n", types)).append("\n],\"blocks\":{\n");
        boolean first = true;
        for (Map.Entry<String, Set<Integer>> e : byBlock.entrySet()) {
            if (!first) sb.append(",\n");
            first = false;
            StringJoiner j = new StringJoiner(",", "[", "]");
            e.getValue().forEach(i -> j.add(i.toString()));
            sb.append('"').append(e.getKey()).append("\":").append(j);
        }
        sb.append("\n},\"extra\":{\n");
        first = true;
        for (Map.Entry<String, List<String>> e : extra.entrySet()) {
            if (!first) sb.append(",\n");
            first = false;
            StringJoiner j = new StringJoiner(",", "[", "]");
            e.getValue().forEach(s -> j.add('"' + s + '"'));
            sb.append('"').append(e.getKey()).append("\":").append(j);
        }
        sb.append("\n}}\n");
        try (PrintWriter w = new PrintWriter(args[0], "UTF-8")) {
            w.print(sb);
        }
        System.out.println("wrote " + byBlock.size() + " blocks with " + types.size() + " sound types (" + extra.size() + " with material sounds) to " + args[0]);
    }
}
