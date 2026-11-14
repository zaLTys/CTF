FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
COPY sim ./sim
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /flagrun .

FROM alpine:3.22
WORKDIR /app
COPY --from=build /flagrun ./flagrun
COPY public ./public
EXPOSE 3000
CMD ["./flagrun"]
