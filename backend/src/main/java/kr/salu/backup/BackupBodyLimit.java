package kr.salu.backup;

import java.io.*;
import java.lang.reflect.Type;
import kr.salu.common.error.ApiException;
import org.springframework.core.MethodParameter;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;

@ControllerAdvice(assignableTypes=BackupController.class)
public class BackupBodyLimit extends RequestBodyAdviceAdapter {
    @Override public boolean supports(MethodParameter parameter,Type type,Class<? extends HttpMessageConverter<?>> converter) { return type==BackupService.Change.class; }
    @Override public HttpInputMessage beforeBodyRead(HttpInputMessage input,MethodParameter parameter,Type type,Class<? extends HttpMessageConverter<?>> converter) throws IOException {
        int limit=2*1024*1024;
        if(input.getHeaders().getContentLength()>limit) throw ApiException.invalidRequest();
        InputStream stream=new FilterInputStream(input.getBody()) {
            private int count;
            private void count(int read) throws IOException { if(read>0 && (count+=read)>limit) throw new IOException("입력 크기 초과"); }
            @Override public int read() throws IOException { int value=in.read();if(value>=0)count(1);return value; }
            @Override public int read(byte[] bytes,int offset,int length) throws IOException { int value=in.read(bytes,offset,Math.min(length,limit-count+1));count(value);return value; }
        };
        return new HttpInputMessage() { public HttpHeaders getHeaders() { return input.getHeaders(); } public InputStream getBody() { return stream; } };
    }
}
