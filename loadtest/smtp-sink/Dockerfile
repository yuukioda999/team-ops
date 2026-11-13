FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /smtp-sink .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /smtp-sink /smtp-sink
EXPOSE 1025 8025
ENTRYPOINT ["/smtp-sink"]
