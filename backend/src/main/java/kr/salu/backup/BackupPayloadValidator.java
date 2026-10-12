package kr.salu.backup;

import java.util.*;
import java.util.regex.Pattern;
import kr.salu.common.error.ApiException;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.*;

@Component
public class BackupPayloadValidator {
    private final JsonNode schema;
    public BackupPayloadValidator(ObjectMapper json) throws java.io.IOException {
        try(var input=new ClassPathResource("personal-backup-schema.json").getInputStream()) { schema=json.readTree(input); }
    }
    public void validate(JsonNode payload) {
        if(!matches(schema,payload,0)) throw ApiException.invalidRequest();
        var state=payload.path("state"); var drafts=payload.path("drafts");
        var cuts=index(state.path("cuts")); var progress=index(state.path("progress")); var photos=index(state.path("photos")); var previews=index(state.path("previews"));
        for(var p:progress.values()) if(!cuts.containsKey(p.path("cutId").asString())) invalid();
        for(var p:photos.values()) { String cutId=p.path("cutId").asString(); if(!cuts.containsKey(cutId)) invalid(); if(p.has("progressId") && (!progress.containsKey(p.path("progressId").asString()) || !progress.get(p.path("progressId").asString()).path("cutId").asString().equals(cutId))) invalid(); }
        for(var preview:previews.values()) {
            String cutId=preview.path("cut").path("id").asString(); if(!cuts.containsKey(cutId) || !preview.path("sourceDraft").path("cutId").asString().equals(cutId)) invalid();
            for(var entry:preview.path("progress")) if(!entry.path("cutId").asString().equals(cutId)) invalid();
            for(var entry:preview.path("photos")) if(!entry.path("cutId").asString().equals(cutId)) invalid();
            request(preview.path("sourceDraft"),cuts,progress,photos,previews);
        }
        for(var entry:drafts.path("requests").properties()) { if(!entry.getKey().equals(entry.getValue().path("id").asString())) invalid(); request(entry.getValue(),cuts,progress,photos,previews); }
        for(String key:List.of("cutEdits","progressDrafts")) for(var entry:drafts.path(key).properties()) if(!cuts.containsKey(entry.getKey())) invalid();
        for(var entry:drafts.path("progressEdits").properties()) if(!progress.containsKey(entry.getKey())) invalid();
        for(var entry:drafts.path("steps").properties()) if(!drafts.path("requests").has(entry.getKey())) invalid();
        var current=drafts.path("currentRequestId"); if(!current.isNull() && !drafts.path("requests").has(current.asString())) invalid();
    }
    private void request(JsonNode d,Map<String,JsonNode> cuts,Map<String,JsonNode> progress,Map<String,JsonNode> photos,Map<String,JsonNode> previews) {
        String cutId=d.path("cutId").asString(); if(!cuts.containsKey(cutId)) invalid();
        Map<String,JsonNode> ps=progress,fs=photos;
        if(d.has("referencePreviewId")) { var preview=previews.get(d.path("referencePreviewId").asString()); if(preview==null || !preview.path("cut").path("id").asString().equals(cutId)) invalid(); ps=index(preview.path("progress"));fs=index(preview.path("photos")); }
        for(var id:d.path("progressIds")) if(!ps.containsKey(id.asString()) || !ps.get(id.asString()).path("cutId").asString().equals(cutId)) invalid();
        for(var id:d.path("photoIds")) if(!fs.containsKey(id.asString()) || !fs.get(id.asString()).path("cutId").asString().equals(cutId)) invalid();
    }
    private Map<String,JsonNode> index(JsonNode array) { var map=new HashMap<String,JsonNode>(); for(var entry:array) if(map.put(entry.path("id").asString(),entry)!=null) invalid(); return map; }
    private void invalid() { throw ApiException.invalidRequest(); }
    // This evaluates only the keywords emitted by the versioned Zod schema; no remote schema resolution.
    private boolean matches(JsonNode rule,JsonNode node,int depth) {
        if(depth>30) return false;
        if(rule.isBoolean()) return rule.asBoolean();
        if(rule.has("anyOf")) { for(var r:rule.path("anyOf")) if(matches(r,node,depth+1)) return true; return false; }
        if(rule.has("const") && !rule.path("const").equals(node)) return false;
        if(rule.has("enum")) { boolean found=false;for(var v:rule.path("enum"))if(v.equals(node))found=true;if(!found)return false; }
        String type=rule.path("type").asString("");
        boolean typed=switch(type) { case "object"->node.isObject();case "array"->node.isArray();case "string"->node.isTextual();case "number"->node.isNumber();case "integer"->node.isIntegralNumber();case "boolean"->node.isBoolean();case "null"->node.isNull();default->true; };
        if(!typed)return false;
        if(node.isTextual()) { String s=node.asString(); if(rule.has("maxLength") && s.codePointCount(0,s.length())>rule.path("maxLength").asInt())return false;if(rule.has("pattern") && !Pattern.compile(rule.path("pattern").asString()).matcher(s).find())return false; }
        if(node.isNumber()) { double n=node.asDouble();if(rule.has("minimum")&&n<rule.path("minimum").asDouble())return false;if(rule.has("maximum")&&n>rule.path("maximum").asDouble())return false; }
        if(node.isArray()) { if(rule.has("maxItems")&&node.size()>rule.path("maxItems").asInt())return false;if(rule.has("minItems")&&node.size()<rule.path("minItems").asInt())return false;for(var v:node)if(!matches(rule.path("items"),v,depth+1))return false; }
        if(node.isObject()) {
            for(var required:rule.path("required"))if(!node.has(required.asString()))return false;
            for(var entry:node.properties()) {
                if(rule.has("propertyNames")&&!matches(rule.path("propertyNames"),tools.jackson.databind.node.StringNode.valueOf(entry.getKey()),depth+1))return false;
                var properties=rule.path("properties"); var r=properties.has(entry.getKey())?properties.path(entry.getKey()):rule.path("additionalProperties");
                if(!matches(r,entry.getValue(),depth+1))return false;
            }
        }
        return true;
    }
}
