{ pkgs }: {
    deps = [
        pkgs.nodejs-16_x
        pkgs.nodePackages.npm
        pkgs.nodePackages.nodemon
    ];
}